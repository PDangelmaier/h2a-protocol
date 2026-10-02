import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  E2E_SUPABASE_URL,
  E2E_SUPABASE_SERVICE_KEY,
  getSupabase,
  buildConfig,
  createTestSession,
  buildSessionState,
  invalidateAllCaches,
  cleanupSession,
  createNexusMock,
  type SessionFixture,
  type NexusMock,
} from './setup.js'
import { reasoningLoop } from '../src/reasoning.js'

const skip = !E2E_SUPABASE_URL || !E2E_SUPABASE_SERVICE_KEY

describe.skipIf(skip)('SPEC-043: Turn-Pfad E2E', { timeout: 60_000 }, () => {
  let supabase: SupabaseClient
  let nexus: NexusMock
  let fixture: SessionFixture
  const config = buildConfig()

  beforeAll(() => {
    supabase = getSupabase()
  })

  beforeEach(async () => {
    invalidateAllCaches()
    nexus = createNexusMock()
    nexus.install()
    fixture = await createTestSession(supabase)
  })

  afterEach(async () => {
    nexus.restore()
    await cleanupSession(supabase, fixture)
  })

  it('AC-1: Suite läuft gegen echte PostgreSQL, nur Nexus gemockt', async () => {
    const { data, error } = await supabase
      .from('agent_tools')
      .select('id')
      .limit(1)

    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data!.length).toBeGreaterThan(0)
  })

  it('AC-2: Einfacher Turn — Antworttext + DB-Einträge', async () => {
    nexus.enqueueText('Guten Tag! Ich bin MAX, Ihr Mercedes-Benz Berater.')

    const session = buildSessionState(fixture)
    const signal = { type: 'text', content: 'Hallo', timestamp: new Date() }
    const result = await reasoningLoop(session, signal, config)

    expect(result.response).toContain('MAX')
    expect(result.securityEvents).toEqual([])

    if (result.backgroundTasks?.length) {
      await Promise.allSettled(result.backgroundTasks)
    }

    const { data: turns } = await supabase
      .from('conversation_turns')
      .select('role, content, prompt_version')
      .eq('session_id', fixture.dbId)
      .order('sequence', { ascending: true })

    expect(turns).toBeDefined()
    expect(turns!.length).toBeGreaterThanOrEqual(2)

    const userTurn = turns!.find(t => t.role === 'user')
    const assistantTurn = turns!.find(t => t.role === 'assistant')
    expect(userTurn).toBeDefined()
    expect(assistantTurn).toBeDefined()
    expect((userTurn!.content as { text: string }).text).toBe('Hallo')
    expect((assistantTurn!.content as { text: string }).text).toContain('MAX')

    const { data: sessionRow } = await supabase
      .from('sessions')
      .select('cost_usd, nexus_call_count')
      .eq('id', fixture.dbId)
      .single()

    expect(sessionRow).toBeDefined()
    expect(Number(sessionRow!.cost_usd)).toBeGreaterThan(0)
    expect(sessionRow!.nexus_call_count).toBeGreaterThanOrEqual(1)

    expect(nexus.requests.length).toBeGreaterThanOrEqual(1)
    const nexusReq = nexus.requests[0]
    expect(nexusReq.body.system).toBeDefined()
    expect(nexusReq.body.messages).toBeDefined()
    const lastMsg = (nexusReq.body.messages as Array<{ role: string; content: Array<{ text: string }> }>).at(-1)
    expect(lastMsg?.role).toBe('user')
    expect(lastMsg?.content[0]?.text).toBe('Hallo')
  })

  it('AC-3: Turn mit Tool — vehicle_catalog (ohne Consent) + configurator (mit Consent)', async () => {
    nexus.enqueueToolUse('tu-1', 'vehicle_catalog', { query: 'EQS' })
    nexus.enqueueText('Der Mercedes-Benz EQS ist unser elektrisches Flaggschiff.')

    const session = buildSessionState(fixture)
    const signal = { type: 'text', content: 'Zeig mir den EQS', timestamp: new Date() }
    const result = await reasoningLoop(session, signal, config)

    expect(result.response).toContain('EQS')
    expect(result.toolsUsed).toContain('vehicle_catalog')

    expect(nexus.requests.length).toBe(2)
    const secondCall = nexus.requests[1]
    const msgs = secondCall.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()
  })

  it('AC-3b: Tool mit fehlendem Consent — configurator blockiert', async () => {
    nexus.enqueueToolUse('tu-2', 'configurator', { model: 'EQS' })
    nexus.enqueueText('Leider kann ich den Konfigurator nicht nutzen.')

    const session = buildSessionState(fixture)
    const signal = { type: 'text', content: 'Konfiguriere mir einen EQS', timestamp: new Date() }
    const result = await reasoningLoop(session, signal, config)

    expect(nexus.requests.length).toBe(2)
    const secondReq = nexus.requests[1]
    const msgs = secondReq.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()

    const toolResultContent = toolResultMsg!.content.find((c: Record<string, unknown>) => 'toolResult' in c) as { toolResult: { content: Array<{ json: { data: { missingConsents?: string[] } } }> } }
    const jsonBlock = toolResultContent?.toolResult?.content?.[0]?.json
    expect(jsonBlock?.data?.missingConsents).toBeDefined()
    expect(jsonBlock!.data.missingConsents).toContain('ai_personalization')
  })

  it('AC-4: Zweiter Turn — History des ersten Turns im Nexus-Request', async () => {
    nexus.enqueueText('Guten Tag! Wie kann ich helfen?')

    const session = buildSessionState(fixture)
    const firstSignal = { type: 'text', content: 'Hallo', timestamp: new Date() }
    const firstResult = await reasoningLoop(session, firstSignal, config)

    if (firstResult.backgroundTasks?.length) {
      await Promise.allSettled(firstResult.backgroundTasks)
    }

    nexus.requests.length = 0

    nexus.enqueueText('Natürlich! Der EQS hat eine Reichweite von bis zu 770 km.')

    const sessionWithHistory = {
      ...session,
      conversationHistory: [
        { role: 'user' as const, content: 'Hallo' },
        { role: 'assistant' as const, content: firstResult.response },
      ],
    }
    const secondSignal = { type: 'text', content: 'Erzähl mir vom EQS', timestamp: new Date() }
    const secondResult = await reasoningLoop(sessionWithHistory, secondSignal, config)

    expect(secondResult.response).toBeTruthy()

    const secondReq = nexus.requests[0]
    const msgs = secondReq.body.messages as Array<{ role: string; content: Array<{ text: string }> }>
    expect(msgs.length).toBeGreaterThanOrEqual(3)

    expect(msgs[0].role).toBe('user')
    expect(msgs[0].content[0].text).toBe('Hallo')
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[2].role).toBe('user')
    expect(msgs[2].content[0].text).toBe('Erzähl mir vom EQS')
  })

  it('AC-5: Kostenlimit — kein Nexus-Call, degradierte Antwort', async () => {
    await supabase
      .from('sessions')
      .update({ cost_usd: 100.0, nexus_call_count: 500 })
      .eq('id', fixture.dbId)

    const session = buildSessionState(fixture)
    const signal = { type: 'text', content: 'Hallo', timestamp: new Date() }
    const result = await reasoningLoop(session, signal, config)

    expect(result.degraded).toBeDefined()
    expect(result.degraded!.reason).toBe('cost_limit')
    expect(result.response).toBeTruthy()
    expect(nexus.requests).toHaveLength(0)
  })

  it('AC-6: Modell-Fallback — 503 beim ersten, zweites antwortet', async () => {
    nexus.enqueueError(503, 'Service Unavailable')
    nexus.enqueueText('Guten Tag! Ich bin Ihr Berater.')

    const { data: activeModels } = await supabase
      .from('model_config')
      .select('model_id, fallback_priority')
      .eq('purpose', 'main')
      .eq('is_active', true)
      .order('fallback_priority', { ascending: true })

    if (!activeModels || activeModels.length < 2) {
      const fallbackId = crypto.randomUUID()
      await supabase.from('model_config').insert({
        id: fallbackId,
        purpose: 'main',
        model_id: 'claude-haiku-4-5',
        is_active: true,
        fallback_priority: 99,
        cost_per_input_1k: 0.00104,
        cost_per_output_1k: 0.0052,
        cost_per_cached_input_1k: 0.000104,
      })
      invalidateAllCaches()
    }

    const session = buildSessionState(fixture)
    const signal = { type: 'text', content: 'Hallo', timestamp: new Date() }
    const result = await reasoningLoop(session, signal, config)

    expect(result.response).toContain('Berater')
    expect(nexus.requests.length).toBe(2)

    const { data: sessionRow } = await supabase
      .from('sessions')
      .select('cost_usd, nexus_call_count')
      .eq('id', fixture.dbId)
      .single()

    expect(Number(sessionRow!.cost_usd)).toBeGreaterThan(0)
  })

  it('AC-7: Fehler ohne Fallback → degradierte Antwort + backgroundTasks', async () => {
    nexus.enqueueError(503, 'Service Unavailable')
    nexus.enqueueError(503, 'Service Unavailable')
    nexus.enqueueError(503, 'Service Unavailable')

    const session = buildSessionState(fixture)
    const signal = { type: 'text', content: 'Hallo', timestamp: new Date() }
    const result = await reasoningLoop(session, signal, config)

    expect(result.degraded).toBeDefined()
    expect(['fallback_exhausted', 'internal_error']).toContain(result.degraded!.reason)
    expect(result.response).toBeTruthy()
  })
})

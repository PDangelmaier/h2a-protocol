import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  E2E_SUPABASE_URL,
  E2E_SUPABASE_SERVICE_KEY,
  getSupabase,
  buildHandlerEnv,
  createTestSession,
  invalidateAllCaches,
  cleanupSession,
  createNexusMock,
  parseSseStream,
  buildStreamRequest,
  buildSessionOpenRequest,
  type SessionFixture,
  type NexusMock,
  type SseEvent,
} from './setup.js'
import { handleRequest, type HandlerEnv } from '../src/handler.js'

const skip = !E2E_SUPABASE_URL || !E2E_SUPABASE_SERVICE_KEY

describe.skipIf(skip)('SPEC-043: Turn-Pfad E2E', { timeout: 60_000 }, () => {
  let supabase: SupabaseClient
  let nexus: NexusMock
  let fixture: SessionFixture
  let env: HandlerEnv

  beforeAll(() => {
    supabase = getSupabase()
    env = buildHandlerEnv()
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

  async function sendStream(text: string): Promise<{ events: SseEvent[]; bgTasks: Promise<unknown>[] }> {
    const req = buildStreamRequest(fixture.sessionId, text)
    const { response, backgroundTasks } = await handleRequest(req, env)
    const events = await parseSseStream(response)
    return { events, bgTasks: backgroundTasks }
  }

  it('AC-1: Suite läuft gegen echte PostgreSQL, nur Nexus gemockt', async () => {
    const { data, error } = await supabase
      .from('agent_tools')
      .select('id')
      .limit(1)

    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data!.length).toBeGreaterThan(0)
  })

  it('AC-1b: session.open über handleRequest', async () => {
    const req = buildSessionOpenRequest({
      customerId: fixture.profileId,
      channel: 'web',
    })
    const { response } = await handleRequest(req, env)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.type).toBe('session.ack')
    expect(body.sessionId).toBeDefined()
  })

  it('AC-2: Einfacher Turn — SSE-Events + DB-Einträge', async () => {
    nexus.enqueueText('Guten Tag! Ich bin MAX, Ihr Mercedes-Benz Berater.')

    const { events, bgTasks } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks)

    const frameEvents = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    expect(frameEvents.length).toBeGreaterThanOrEqual(1)
    const textContent = frameEvents.map(e => (e.content as { text: string }).text).join('')
    expect(textContent).toContain('MAX')

    const endEvent = events.find(e => e.type === 'agent.frame' && e.frameType === 'end')
    expect(endEvent).toBeDefined()

    const presenceEvents = events.filter(e => e.type === 'presence.update')
    expect(presenceEvents.length).toBeGreaterThanOrEqual(2)
    expect(presenceEvents[0].state).toBe('conversing')
    expect(presenceEvents.at(-1)!.state).toBe('attentive')

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

    expect(Number(sessionRow!.cost_usd)).toBeGreaterThan(0)
    expect(sessionRow!.nexus_call_count).toBeGreaterThanOrEqual(1)
    expect(nexus.requests.length).toBeGreaterThanOrEqual(1)

    const { data: ttftEvents } = await supabase
      .from('analytics_events')
      .select('event_type, metadata')
      .eq('session_id', fixture.sessionId)
      .eq('event_type', 'ttft_measurement')

    expect(ttftEvents).toBeDefined()
    expect(ttftEvents!.length).toBeGreaterThanOrEqual(1)
    const ttft = ttftEvents![0].metadata as { ttft_ms: number; total_ms: number }
    expect(ttft.ttft_ms).toBeGreaterThan(0)
    expect(ttft.total_ms).toBeGreaterThanOrEqual(ttft.ttft_ms)
  })

  it('AC-3: Turn mit Tool — vehicle_catalog (ohne Consent) + Nexus-Request', async () => {
    nexus.enqueueToolUse('tu-1', 'vehicle_catalog', { query: 'EQS' })
    nexus.enqueueText('Der Mercedes-Benz EQS ist unser elektrisches Flaggschiff.')

    const { events, bgTasks } = await sendStream('Zeig mir den EQS')
    await Promise.allSettled(bgTasks)

    const textFrames = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    const fullText = textFrames.map(e => (e.content as { text: string }).text).join('')
    expect(fullText).toContain('EQS')

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

    const { events, bgTasks } = await sendStream('Konfiguriere mir einen EQS')
    await Promise.allSettled(bgTasks)

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

    const { bgTasks: bgTasks1 } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks1)

    nexus.requests.length = 0

    nexus.enqueueText('Natürlich! Der EQS hat eine Reichweite von bis zu 770 km.')

    const { events, bgTasks: bgTasks2 } = await sendStream('Erzähl mir vom EQS')
    await Promise.allSettled(bgTasks2)

    const textFrames = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    expect(textFrames.length).toBeGreaterThanOrEqual(1)

    const secondReq = nexus.requests[0]
    const msgs = secondReq.body.messages as Array<{ role: string; content: Array<{ text: string }> }>
    expect(msgs.length).toBeGreaterThanOrEqual(3)

    expect(msgs[0].role).toBe('user')
    expect(msgs[0].content[0].text).toBe('Hallo')
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[2].role).toBe('user')
    expect(msgs[2].content[0].text).toBe('Erzähl mir vom EQS')
  })

  it('AC-5: Kostenlimit — kein Nexus-Call, degradierte SSE-Antwort', async () => {
    await supabase
      .from('sessions')
      .update({ cost_usd: 100.0, nexus_call_count: 500 })
      .eq('id', fixture.dbId)

    const { events, bgTasks } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks)

    const degradedEvent = events.find(e => e.type === 'degraded_response')
    expect(degradedEvent).toBeDefined()
    expect(degradedEvent!.reason).toBe('cost_limit')

    const textFrames = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    expect(textFrames.length).toBeGreaterThanOrEqual(1)

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

    const { events, bgTasks } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks)

    const textFrames = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    const fullText = textFrames.map(e => (e.content as { text: string }).text).join('')
    expect(fullText).toContain('Berater')
    expect(nexus.requests.length).toBe(2)

    const { data: sessionRow } = await supabase
      .from('sessions')
      .select('cost_usd, nexus_call_count')
      .eq('id', fixture.dbId)
      .single()

    expect(Number(sessionRow!.cost_usd)).toBeGreaterThan(0)
  })

  it('AC-7: Fehler ohne Fallback → degradierte SSE-Antwort + backgroundTasks', async () => {
    nexus.enqueueError(503, 'Service Unavailable')
    nexus.enqueueError(503, 'Service Unavailable')
    nexus.enqueueError(503, 'Service Unavailable')

    const { events, bgTasks } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks)

    const degradedEvent = events.find(e => e.type === 'degraded_response')
    expect(degradedEvent).toBeDefined()
    expect(['fallback_exhausted', 'internal_error']).toContain(degradedEvent!.reason)

    const textFrames = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    expect(textFrames.length).toBeGreaterThanOrEqual(1)
  })
})

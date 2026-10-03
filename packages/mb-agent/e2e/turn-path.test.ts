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

if (skip && process.env.CI) {
  throw new Error('E2E env vars (E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_KEY) missing in CI — tests must not be silently skipped')
}

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

  function enqueueBackgroundResponses() {
    nexus.enqueueText('{"memories":[]}')
    nexus.enqueueText('{"sentiment":"neutral","resolution":"pending","escalation":false}')
  }

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

  it('AC-1c: session.open → stream auf neuer Session', async () => {
    const openReq = buildSessionOpenRequest({
      customerId: fixture.profileId,
      channel: 'web',
    })
    const { response: openResp } = await handleRequest(openReq, env)
    const openBody = await openResp.json()
    const newSessionId = openBody.sessionId as string
    expect(newSessionId).toBeDefined()

    nexus.enqueueText('Willkommen!')
    enqueueBackgroundResponses()

    const streamReq = buildStreamRequest(newSessionId, 'Hallo')
    const { response: streamResp, backgroundTasks } = await handleRequest(streamReq, env)
    const events = await parseSseStream(streamResp)
    await Promise.allSettled(backgroundTasks)

    const textFrames = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    expect(textFrames.length).toBeGreaterThanOrEqual(1)
    const text = textFrames.map(e => (e.content as { text: string }).text).join('')
    expect(text).toContain('Willkommen')

    const { data: sessionRow } = await supabase
      .from('sessions')
      .select('id')
      .eq('h2a_session_id', newSessionId)
      .single()
    if (sessionRow) {
      await supabase.from('analytics_events').delete().eq('session_id', sessionRow.id)
      await supabase.from('conversation_turns').delete().eq('session_id', sessionRow.id)
      await supabase.from('sessions').delete().eq('id', sessionRow.id)
    }
  })

  it('AC-2: Einfacher Turn — SSE-Events + DB-Einträge', async () => {
    nexus.enqueueText('Guten Tag! Ich bin MAX, Ihr Mercedes-Benz Berater.')
    enqueueBackgroundResponses()

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
    expect(turns!.length).toBe(2)

    expect(turns![0].role).toBe('user')
    expect(turns![1].role).toBe('assistant')
    expect((turns![0].content as { text: string }).text).toBe('Hallo')
    expect((turns![1].content as { text: string }).text).toContain('MAX')

    expect(turns![1].prompt_version).toBeTypeOf('number')
    expect(turns![1].prompt_version).toBeGreaterThanOrEqual(1)

    const { data: sessionRow } = await supabase
      .from('sessions')
      .select('cost_usd, nexus_call_count')
      .eq('id', fixture.dbId)
      .single()

    expect(Number(sessionRow!.cost_usd)).toBeGreaterThan(0)
    expect(sessionRow!.nexus_call_count).toBe(3)
    expect(nexus.requests.filter(r => r.url.includes('claude-sonnet-4-6/converse')).length).toBe(1)

    const { data: ttftEvents } = await supabase
      .from('analytics_events')
      .select('event_type, metadata')
      .eq('session_id', fixture.dbId)
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
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Zeig mir den EQS')
    await Promise.allSettled(bgTasks)

    const textFrames = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    const fullText = textFrames.map(e => (e.content as { text: string }).text).join('')
    expect(fullText).toContain('EQS')

    const mainRequests = nexus.requests.filter(r => r.url.includes('claude-sonnet-4-6/converse'))
    expect(mainRequests.length).toBe(2)
    const secondCall = mainRequests[1]
    const msgs = secondCall.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()
  })

  it('AC-3b: Tool mit fehlendem Consent — configurator blockiert', async () => {
    nexus.enqueueToolUse('tu-2', 'configurator', { model: 'EQS' })
    nexus.enqueueText('Leider kann ich den Konfigurator nicht nutzen.')
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Konfiguriere mir einen EQS')
    await Promise.allSettled(bgTasks)

    const mainRequests = nexus.requests.filter(r => r.url.includes('claude-sonnet-4-6/converse'))
    expect(mainRequests.length).toBe(2)
    const secondReq = mainRequests[1]
    const msgs = secondReq.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()

    const toolResultContent = toolResultMsg!.content.find((c: Record<string, unknown>) => 'toolResult' in c) as { toolResult: { content: Array<{ json: { data: { missingConsents?: string[] } } }> } }
    const jsonBlock = toolResultContent?.toolResult?.content?.[0]?.json
    expect(jsonBlock?._h2a_tool_data).toBe(true)
    expect(jsonBlock?.tool).toBe('configurator')
    expect(jsonBlock?.data?.missingConsents).toBeDefined()
    expect(jsonBlock!.data.missingConsents).toContain('ai_personalization')
  })

  it('AC-4: Zweiter Turn — History des ersten Turns im Nexus-Request', async () => {
    nexus.enqueueText('Guten Tag! Wie kann ich helfen?')
    enqueueBackgroundResponses()

    const { bgTasks: bgTasks1 } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks1)

    nexus.requests.length = 0

    nexus.enqueueText('Natürlich! Der EQS hat eine Reichweite von bis zu 770 km.')
    enqueueBackgroundResponses()

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

  it('AC-6: Modell-Fallback — 503 bei Sonnet, Haiku antwortet mit Haiku-Preis', async () => {
    const { data: activeModels } = await supabase
      .from('model_config')
      .select('model_id, fallback_priority, cost_per_input_1k, cost_per_output_1k, cost_per_cached_input_1k')
      .eq('purpose', 'main')
      .eq('is_active', true)
      .order('fallback_priority', { ascending: true })

    const models = activeModels as Array<{ model_id: string; fallback_priority: number; cost_per_input_1k: number; cost_per_output_1k: number; cost_per_cached_input_1k: number }>
    expect(models.length).toBeGreaterThanOrEqual(2)
    expect(models[0].model_id).not.toBe(models[1].model_id)

    nexus.enqueueError(503, 'Service Unavailable')
    nexus.enqueueText('Guten Tag! Ich bin Ihr Berater.')
    enqueueBackgroundResponses()
    invalidateAllCaches()

    const { events, bgTasks } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks)

    const textFrames = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    const fullText = textFrames.map(e => (e.content as { text: string }).text).join('')
    expect(fullText).toContain('Berater')
    const sonnetRequests = nexus.requests.filter(r => r.url.includes('claude-sonnet-4-6/converse'))
    const haikuRequests = nexus.requests.filter(r => r.url.includes('claude-haiku-4-5/converse'))
    expect(sonnetRequests.length).toBe(1)
    expect(haikuRequests.length).toBe(3)

    const { data: sessionRow } = await supabase
      .from('sessions')
      .select('cost_usd')
      .eq('id', fixture.dbId)
      .single()

    const costUsd = Number(sessionRow!.cost_usd)
    const fallbackModel = models[1]
    const perCallCost = (100 * Number(fallbackModel.cost_per_input_1k) + 50 * Number(fallbackModel.cost_per_output_1k)) / 1000
    const expectedCost = 3 * perCallCost
    expect(costUsd).toBeCloseTo(expectedCost, 6)
  })

  it('SPEC-045 AC-1: Session über Kostenlimit → 0 Nexus-Aufrufe', async () => {
    const { data: configRows } = await supabase
      .from('cost_gate_config')
      .select('key, value')
      .in('key', ['cost_limit_eur', 'usd_eur_rate'])

    const config = new Map(
      (configRows ?? []).map((r: { key: string; value: number }) => [r.key, Number(r.value)]),
    )
    const limitEur = config.get('cost_limit_eur') ?? 0.5
    const rate = config.get('usd_eur_rate') ?? 0.92
    const overLimitUsd = (limitEur / rate) + 1.0

    await supabase
      .from('sessions')
      .update({ cost_usd: overLimitUsd })
      .eq('id', fixture.dbId)

    nexus.enqueueText('This should never be reached')

    const { events, bgTasks } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks)

    expect(nexus.requests.length).toBe(0)

    const degradedEvent = events.find(e => e.type === 'degraded_response')
    expect(degradedEvent).toBeDefined()
    expect(degradedEvent!.reason).toBe('cost_limit')
  })

  it('SPEC-045 AC-3: hängender Nexus → Degradation innerhalb Time-Budget', async () => {
    const budgetMs = 3000
    await supabase
      .from('cost_gate_config')
      .upsert({ key: 'time_budget_ms', value: budgetMs }, { onConflict: 'key' })
    invalidateAllCaches()

    nexus.enqueueDelay(60_000)
    nexus.enqueueDelay(60_000)
    nexus.enqueueDelay(60_000)

    const start = Date.now()
    const { events, bgTasks } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks)
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(budgetMs + 2000)

    const degradedEvent = events.find(e => e.type === 'degraded_response')
    expect(degradedEvent).toBeDefined()
    expect(['fallback_exhausted', 'internal_error', 'timeout']).toContain(degradedEvent!.reason)

    await supabase
      .from('cost_gate_config')
      .upsert({ key: 'time_budget_ms', value: 20000 }, { onConflict: 'key' })
  })

  it('SPEC-045 AC-4a: 404 (Modell nicht verfügbar) → Fallback zum nächsten Modell', async () => {
    nexus.enqueueError(404, 'Model not found')
    nexus.enqueueText('Guten Tag! Fallback hat funktioniert.')

    const { data: activeModels } = await supabase
      .from('model_config')
      .select('model_id, fallback_priority')
      .eq('purpose', 'main')
      .eq('is_active', true)
      .order('fallback_priority', { ascending: true })

    if (!activeModels || activeModels.length < 2) {
      await supabase.from('model_config').insert({
        id: crypto.randomUUID(),
        purpose: 'main',
        model_id: 'claude-haiku-4-5',
        is_active: true,
        fallback_priority: 99,
        cost_per_input_1k: 0.0013,
        cost_per_output_1k: 0.0065,
        cost_per_cached_input_1k: 0.00013,
      })
      invalidateAllCaches()
    }

    const { events, bgTasks } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks)

    const textFrames = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    const fullText = textFrames.map(e => (e.content as { text: string }).text).join('')
    expect(fullText).toContain('Fallback')
    expect(nexus.requests.length).toBe(2)
  })

  it('SPEC-045 AC-4b: Netzwerkfehler → Fallback zum nächsten Modell', async () => {
    nexus.enqueueNetworkError('fetch failed')
    nexus.enqueueText('Guten Tag! Nach Netzwerkfehler geantwortet.')

    const { data: activeModels } = await supabase
      .from('model_config')
      .select('model_id, fallback_priority')
      .eq('purpose', 'main')
      .eq('is_active', true)
      .order('fallback_priority', { ascending: true })

    if (!activeModels || activeModels.length < 2) {
      await supabase.from('model_config').insert({
        id: crypto.randomUUID(),
        purpose: 'main',
        model_id: 'claude-haiku-4-5',
        is_active: true,
        fallback_priority: 99,
        cost_per_input_1k: 0.0013,
        cost_per_output_1k: 0.0065,
        cost_per_cached_input_1k: 0.00013,
      })
      invalidateAllCaches()
    }

    const { events, bgTasks } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks)

    const textFrames = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    const fullText = textFrames.map(e => (e.content as { text: string }).text).join('')
    expect(fullText).toContain('Netzwerkfehler')
    expect(nexus.requests.length).toBe(2)
  })

  it('SPEC-045 AC-4c: Fallback-Kette enthält nur verschiedene Modelle', async () => {
    const { data } = await supabase
      .from('model_config')
      .select('purpose, model_id')
      .eq('is_active', true)
      .order('purpose')
      .order('fallback_priority', { ascending: true })

    const chains = new Map<string, string[]>()
    for (const row of (data ?? []) as Array<{ purpose: string; model_id: string }>) {
      const list = chains.get(row.purpose) ?? []
      list.push(row.model_id)
      chains.set(row.purpose, list)
    }

    for (const [purpose, modelIds] of chains) {
      const unique = new Set(modelIds)
      expect(unique.size, `Duplicate model in chain for purpose "${purpose}"`).toBe(modelIds.length)
    }
  })

  it('SPEC-045 AC-4d: Alle genutzten purposes haben mindestens eine aktive Kette', async () => {
    const requiredPurposes = ['main', 'fast', 'summarization', 'memory-extraction']
    const { data } = await supabase
      .from('model_config')
      .select('purpose')
      .eq('is_active', true)

    const activePurposes = new Set((data ?? []).map((r: { purpose: string }) => r.purpose))
    for (const p of requiredPurposes) {
      expect(activePurposes.has(p), `purpose "${p}" has no active model`).toBe(true)
    }
  })

  it('SPEC-045 AC-5a: 20 gleichzeitige Buchungen → exakte Summe', async () => {
    const costPerCall = 0.001
    const concurrency = 20

    await supabase
      .from('sessions')
      .update({ cost_usd: 0, nexus_call_count: 0, input_tokens_total: 0 })
      .eq('id', fixture.dbId)

    const promises = Array.from({ length: concurrency }, () =>
      supabase.rpc('increment_session_cost', {
        p_session_id: fixture.sessionId,
        p_cost_delta: costPerCall,
        p_input_tokens: 100,
      }),
    )

    const results = await Promise.all(promises)
    for (const r of results) {
      expect(r.error).toBeNull()
    }

    const { data: sessionRow } = await supabase
      .from('sessions')
      .select('cost_usd, nexus_call_count, input_tokens_total')
      .eq('id', fixture.dbId)
      .single()

    const expectedCost = costPerCall * concurrency
    expect(Number(sessionRow!.cost_usd)).toBeCloseTo(expectedCost, 6)
    expect(sessionRow!.nexus_call_count).toBe(concurrency)
    expect(Number(sessionRow!.input_tokens_total)).toBe(100 * concurrency)
  })

  it('SPEC-045 AC-5b: Buchung für nicht-existente Session → leere Rückgabe', async () => {
    const { data, error } = await supabase.rpc('increment_session_cost', {
      p_session_id: 'nonexistent-session-id',
      p_cost_delta: 0.001,
      p_input_tokens: 50,
    })

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('SPEC-045 AC-5c: Rückgabewert enthält aktualisierte Felder', async () => {
    await supabase
      .from('sessions')
      .update({ cost_usd: 0.01, nexus_call_count: 5, input_tokens_total: 500 })
      .eq('id', fixture.dbId)

    const { data, error } = await supabase.rpc('increment_session_cost', {
      p_session_id: fixture.sessionId,
      p_cost_delta: 0.002,
      p_input_tokens: 100,
    })

    expect(error).toBeNull()
    const row = (data as Array<{ cost_usd: number; nexus_call_count: number; input_tokens_total: number }>)[0]
    expect(Number(row.cost_usd)).toBeCloseTo(0.012, 6)
    expect(row.nexus_call_count).toBe(6)
    expect(Number(row.input_tokens_total)).toBe(600)
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

  it('AC-8: Kaputtes JSON → degradierte SSE-Antwort (kein Abbruch)', async () => {
    const req = new Request('http://localhost/h2a/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-H2A-Session': fixture.sessionId },
      body: '{{not valid json',
    })
    const { response } = await handleRequest(req, env)
    const events = await parseSseStream(response)

    const degraded = events.find(e => e.type === 'degraded_response')
    expect(degraded).toBeDefined()
    expect(degraded!.reason).toBe('invalid_request')

    const textFrame = events.find(e => e.type === 'agent.frame' && e.frameType === 'text')
    expect(textFrame).toBeDefined()

    const endFrame = events.find(e => e.type === 'agent.frame' && e.frameType === 'end')
    expect(endFrame).toBeDefined()
  })

  it('AC-8b: Ungültige Session-ID → degraded_response mit invalid_session', async () => {
    const req = buildStreamRequest('nonexistent-session-id', 'Hallo')
    const { response } = await handleRequest(req, env)
    const events = await parseSseStream(response)

    const degraded = events.find(e => e.type === 'degraded_response')
    expect(degraded).toBeDefined()
    expect(degraded!.reason).toBe('invalid_session')

    const textFrame = events.find(e => e.type === 'agent.frame' && e.frameType === 'text')
    expect(textFrame).toBeDefined()

    const endFrame = events.find(e => e.type === 'agent.frame' && e.frameType === 'end')
    expect(endFrame).toBeDefined()
  })

  it('AC-9: session.open → stream mit zurückgegebener Session-ID', async () => {
    const openReq = buildSessionOpenRequest({
      customerId: fixture.profileId,
      channel: 'web',
    })
    const { response: openRes } = await handleRequest(openReq, env)
    expect(openRes.status).toBe(200)

    const ack = await openRes.json()
    expect(ack.sessionId).toBeDefined()

    nexus.enqueueText('Willkommen zurück!')
    enqueueBackgroundResponses()

    const streamReq = buildStreamRequest(ack.sessionId, 'Hallo')
    const { response: streamRes, backgroundTasks } = await handleRequest(streamReq, env)
    const events = await parseSseStream(streamRes)
    await Promise.allSettled(backgroundTasks)

    const textFrames = events.filter(e => e.type === 'agent.frame' && e.frameType === 'text')
    expect(textFrames.length).toBeGreaterThanOrEqual(1)

    const { data: newSession } = await supabase
      .from('sessions')
      .select('id')
      .eq('h2a_session_id', ack.sessionId)
      .single()
    expect(newSession).toBeDefined()

    await supabase.from('analytics_events').delete().eq('session_id', newSession!.id)
    await supabase.from('conversation_turns').delete().eq('session_id', newSession!.id)
    await supabase.from('sessions').delete().eq('id', newSession!.id)
  })

  it('AC-10: Tool mit erteiltem Consent — configurator erlaubt', async () => {
    await supabase.from('consent_records').insert({
      customer_id: fixture.profileId,
      consent_type: 'ai_personalization',
      granted: true,
    })

    nexus.enqueueToolUse('tu-consent', 'configurator', { model: 'EQS' })
    nexus.enqueueText('Ich starte den Konfigurator für den EQS.')
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Konfiguriere mir einen EQS')
    await Promise.allSettled(bgTasks)

    const mainRequests = nexus.requests.filter(r => r.url.includes('claude-sonnet-4-6/converse'))
    expect(mainRequests.length).toBe(2)

    const secondReq = mainRequests[1]
    const msgs = secondReq.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()
    const toolResultContent = toolResultMsg!.content.find((c: Record<string, unknown>) => 'toolResult' in c) as { toolResult: { content: Array<{ json: { data: { missingConsents?: string[] } } }> } }
    const jsonBlock = toolResultContent?.toolResult?.content?.[0]?.json
    expect(jsonBlock?.data?.missingConsents).toBeUndefined()

    await supabase.from('consent_records').delete().eq('customer_id', fixture.profileId)
  })

  it('AC-11: Presence conversing-Event kommt vor dem ersten Text-Frame', async () => {
    nexus.enqueueText('Antwort')
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Test')
    await Promise.allSettled(bgTasks)

    const presenceIdx = events.findIndex(e => e.type === 'presence.update' && e.state === 'conversing')
    const firstTextIdx = events.findIndex(e => e.type === 'agent.frame' && e.frameType === 'text')
    expect(presenceIdx).toBeGreaterThanOrEqual(0)
    expect(firstTextIdx).toBeGreaterThan(presenceIdx)
  })

  it('F6-a: Tool-Pruning — min_pid_score > pidScore filtert Tools', async () => {
    const { data: allTools } = await supabase
      .from('agent_tools')
      .select('tool_name, min_pid_score')
      .eq('is_active', true)

    const pidExcluded = allTools!.filter(t => t.min_pid_score > 50)
    expect(pidExcluded.length).toBeGreaterThan(0)

    const { data: pruningRow } = await supabase
      .from('cost_gate_config')
      .select('value')
      .eq('key', 'tool_pruning_max')
      .maybeSingle()
    const maxTools = pruningRow ? Number(pruningRow.value) : 8

    nexus.enqueueText('Ich helfe Ihnen gerne.')
    enqueueBackgroundResponses()

    const { bgTasks } = await sendStream('Hallo')
    await Promise.allSettled(bgTasks)

    const converseReq = nexus.requests.find(r => r.url.includes('claude-sonnet-4-6/converse'))
    const toolConfig = converseReq!.body.toolConfig as { tools: Array<{ toolSpec: { name: string } }> }
    const toolNames = toolConfig.tools.map(t => t.toolSpec.name)

    expect(toolNames.length).toBeLessThanOrEqual(maxTools)
    expect(toolNames.length).toBeGreaterThan(0)
    for (const t of pidExcluded) expect(toolNames).not.toContain(t.tool_name)
  })

  it('F6-b: DB-Zustand nach Stream-Ende ohne backgroundTasks abzuwarten', async () => {
    nexus.enqueueText('Test ohne bgTasks')
    enqueueBackgroundResponses()

    const req = buildStreamRequest(fixture.sessionId, 'DB-Check')
    const { response } = await handleRequest(req, env)
    await parseSseStream(response)

    const { data: turns } = await supabase
      .from('conversation_turns')
      .select('role')
      .eq('session_id', fixture.dbId)
      .order('sequence', { ascending: true })

    expect(turns!.length).toBe(2)
    expect(turns![0].role).toBe('user')
    expect(turns![1].role).toBe('assistant')
  })

  it('F6-c: en-Session — degraded text in English', async () => {
    const enProfileId = crypto.randomUUID()
    const enSessionId = `e2e-en-${crypto.randomUUID()}`
    const enDbId = crypto.randomUUID()

    await supabase.from('customer_profiles').insert({
      id: enProfileId, pid_score: 50, identity_tier: 'recognized', locale: 'en-GB', display_name: 'EN Testuser',
    })
    await supabase.from('sessions').insert({
      id: enDbId, h2a_session_id: enSessionId, customer_id: enProfileId,
      channel: 'web', journey_phase: 'research', status: 'active',
      channel_metadata: { market: 'gb', locale: 'en-GB' },
    })

    await supabase.from('sessions').update({ cost_usd: 100.0, nexus_call_count: 500 }).eq('id', enDbId)

    const req = buildStreamRequest(enSessionId, 'Hello')
    const { response, backgroundTasks } = await handleRequest(req, env)
    const events = await parseSseStream(response)
    await Promise.allSettled(backgroundTasks)

    const degraded = events.find(e => e.type === 'degraded_response')
    expect(degraded!.reason).toBe('cost_limit')

    const textFrame = events.find(e => e.type === 'agent.frame' && e.frameType === 'text')
    const text = (textFrame!.content as { text: string }).text
    expect(text.toLowerCase()).not.toContain('versuchen')

    await supabase.from('analytics_events').delete().eq('session_id', enDbId)
    await supabase.from('conversation_turns').delete().eq('session_id', enDbId)
    await supabase.from('sessions').delete().eq('id', enDbId)
    await supabase.from('customer_profiles').delete().eq('id', enProfileId)
  })
})

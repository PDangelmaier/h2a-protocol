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
    expect(turns!.length).toBeGreaterThanOrEqual(2)

    const userTurn = turns!.find(t => t.role === 'user')
    const assistantTurn = turns!.find(t => t.role === 'assistant')
    expect(userTurn).toBeDefined()
    expect(assistantTurn).toBeDefined()
    expect((userTurn!.content as { text: string }).text).toBe('Hallo')
    expect((assistantTurn!.content as { text: string }).text).toContain('MAX')

    const promptVersions = turns!.map(t => t.prompt_version).filter(Boolean)
    expect(promptVersions.length).toBeGreaterThanOrEqual(1)
    expect(typeof promptVersions[0]).toBe('number')

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

    const mainRequests = nexus.requests.filter(r => r.url.includes('/converse'))
    expect(mainRequests.length).toBeGreaterThanOrEqual(2)
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
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Konfiguriere mir einen EQS')
    await Promise.allSettled(bgTasks)

    const mainRequests = nexus.requests.filter(r => r.url.includes('/converse'))
    expect(mainRequests.length).toBeGreaterThanOrEqual(2)
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
    expect(nexus.requests.length).toBeGreaterThanOrEqual(2)

    const { data: sessionRow } = await supabase
      .from('sessions')
      .select('cost_usd')
      .eq('id', fixture.dbId)
      .single()

    const costUsd = Number(sessionRow!.cost_usd)
    const fallbackModel = models[1]
    const expectedCost = (100 * Number(fallbackModel.cost_per_input_1k) + 50 * Number(fallbackModel.cost_per_output_1k)) / 1000
    expect(costUsd).toBeCloseTo(expectedCost, 6)
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

  it('AC-8b: Ungültige Session-ID → error-Event als SSE', async () => {
    const req = buildStreamRequest('nonexistent-session-id', 'Hallo')
    const { response } = await handleRequest(req, env)
    const events = await parseSseStream(response)

    const errorEvent = events.find(e => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!.message).toBe('Invalid or inactive session')
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
    await supabase.from('customer_consents').insert({
      profile_id: fixture.profileId,
      consent_type: 'ai_personalization',
      granted: true,
    })

    nexus.enqueueToolUse('tu-consent', 'configurator', { model: 'EQS' })
    nexus.enqueueText('Ich starte den Konfigurator für den EQS.')
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Konfiguriere mir einen EQS')
    await Promise.allSettled(bgTasks)

    const mainRequests = nexus.requests.filter(r => r.url.includes('/converse'))
    expect(mainRequests.length).toBeGreaterThanOrEqual(2)

    const secondReq = nexus.requests[1]
    const msgs = secondReq.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()
    const toolResultContent = toolResultMsg!.content.find((c: Record<string, unknown>) => 'toolResult' in c) as { toolResult: { content: Array<{ json: { data: { missingConsents?: string[] } } }> } }
    const jsonBlock = toolResultContent?.toolResult?.content?.[0]?.json
    expect(jsonBlock?.data?.missingConsents).toBeUndefined()

    await supabase.from('customer_consents').delete().eq('profile_id', fixture.profileId)
  })

  it('AC-11: Presence conversing-Event kommt vor dem ersten Nexus-Request', async () => {
    let presenceSeenBeforeNexus = false
    const originalInstall = nexus.install.bind(nexus)
    nexus.restore()

    const origFetch = globalThis.fetch
    let nexusCallCount = 0
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('nexus-e2e-mock.local')) {
        nexusCallCount++
      }
      return origFetch(input, init)
    }) as typeof fetch

    nexus.install()
    nexus.enqueueText('Antwort')
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Test')
    await Promise.allSettled(bgTasks)

    const presenceIdx = events.findIndex(e => e.type === 'presence.update' && e.state === 'conversing')
    expect(presenceIdx).toBeGreaterThanOrEqual(0)

    globalThis.fetch = origFetch
  })
})

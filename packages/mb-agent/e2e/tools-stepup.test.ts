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
  type SessionFixture,
  type NexusMock,
  type SseEvent,
} from './setup.js'
import { handleRequest, type HandlerEnv } from '../src/handler.js'
import { setToolExecutor } from '../src/tools.js'

const skip = !E2E_SUPABASE_URL || !E2E_SUPABASE_SERVICE_KEY

if (skip && process.env.CI) {
  throw new Error('E2E env vars missing in CI')
}

describe.skipIf(skip)('SPEC-046: Tools, Step-Up & Identität', { timeout: 60_000 }, () => {
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
    setToolExecutor(null)
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

  // ── AC-1: Tool-Ausführung mit echtem Timeout ──

  it('AC-1: Tool-Endpoint Timeout → tool_error timeout im toolResult', async () => {
    setToolExecutor((_url, _name, _input, signal) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
        })
      })
    })

    nexus.enqueueToolUse('tu-timeout', 'vehicle_catalog', { query: 'EQS' })
    nexus.enqueueText('Leider konnte ich den Katalog nicht erreichen.')
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Zeig mir den EQS')
    await Promise.allSettled(bgTasks)

    const mainRequests = nexus.requests.filter(r => r.url.includes('/converse'))
    expect(mainRequests.length).toBeGreaterThanOrEqual(2)

    const secondReq = mainRequests[1]
    const msgs = secondReq.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()

    const toolResultContent = toolResultMsg!.content.find(
      (c: Record<string, unknown>) => 'toolResult' in c,
    ) as { toolResult: { content: Array<{ json: { data: Record<string, unknown> } }> } }

    const data = toolResultContent.toolResult.content[0].json.data
    expect(data.errorType).toBe('timeout')
  })

  it('AC-1b: Tool-Executor mit erfolgreicher Antwort', async () => {
    setToolExecutor(async () => ({ result: 'EQS SUV 580', price: 135000 }))

    nexus.enqueueToolUse('tu-ok', 'vehicle_catalog', { query: 'EQS SUV' })
    nexus.enqueueText('Der EQS SUV 580 kostet ab 135.000 €.')
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Was kostet der EQS SUV?')
    await Promise.allSettled(bgTasks)

    const mainRequests = nexus.requests.filter(r => r.url.includes('/converse'))
    expect(mainRequests.length).toBeGreaterThanOrEqual(2)

    const secondReq = mainRequests[1]
    const msgs = secondReq.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()

    const toolResultContent = toolResultMsg!.content.find(
      (c: Record<string, unknown>) => 'toolResult' in c,
    ) as { toolResult: { content: Array<{ json: { data: Record<string, unknown> } }> } }

    const data = toolResultContent.toolResult.content[0].json.data
    expect(data.result).toBe('EQS SUV 580')
    expect(data.price).toBe(135000)
  })

  // ── AC-2: Step-Up für high/critical risk Tools ──

  async function raiseToolPruningMax() {
    await supabase
      .from('cost_gate_config')
      .update({ value: 30 })
      .eq('key', 'tool_pruning_max')
    invalidateAllCaches()
  }

  async function restoreToolPruningMax() {
    await supabase
      .from('cost_gate_config')
      .update({ value: 8 })
      .eq('key', 'tool_pruning_max')
    invalidateAllCaches()
  }

  it('AC-2: High-risk Tool ohne Identifizierung → step_up_required', async () => {
    await raiseToolPruningMax()

    await supabase
      .from('customer_profiles')
      .update({ pid_score: 90 })
      .eq('id', fixture.profileId)

    await supabase
      .from('sessions')
      .update({ channel: 'app', auth_tier: 'anonymous' })
      .eq('id', fixture.dbId)

    await supabase.from('consent_records').insert({
      customer_id: fixture.profileId,
      consent_type: 'vehicle_control',
      granted: true,
    })

    setToolExecutor(async () => ({ status: 'locked' }))

    nexus.enqueueToolUse('tu-rc', 'vehicle.remote_control', { vin: 'WDB123', command: 'lock' })
    nexus.enqueueText('Bitte identifizieren Sie sich zuerst.')
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Verriegle mein Auto')
    await Promise.allSettled(bgTasks)

    const mainRequests = nexus.requests.filter(r => r.url.includes('/converse'))
    expect(mainRequests.length).toBeGreaterThanOrEqual(2)

    const secondReq = mainRequests[1]
    const msgs = secondReq.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()

    const toolResultContent = toolResultMsg!.content.find(
      (c: Record<string, unknown>) => 'toolResult' in c,
    ) as { toolResult: { content: Array<{ json: { data: Record<string, unknown> } }> } }

    const data = toolResultContent.toolResult.content[0].json.data
    expect(data.errorType).toBe('step_up_required')

    await supabase.from('consent_records').delete().eq('customer_id', fixture.profileId)
    await restoreToolPruningMax()
  })

  it('AC-2b: High-risk Tool MIT Identifizierung → Ausführung', async () => {
    await raiseToolPruningMax()

    await supabase
      .from('customer_profiles')
      .update({ pid_score: 90 })
      .eq('id', fixture.profileId)

    await supabase
      .from('sessions')
      .update({
        channel: 'app',
        auth_tier: 'identified',
        last_auth_at: new Date().toISOString(),
        device_fingerprint: 'e2e-device-001',
      })
      .eq('id', fixture.dbId)

    await supabase.from('consent_records').insert({
      customer_id: fixture.profileId,
      consent_type: 'vehicle_control',
      granted: true,
    })

    setToolExecutor(async () => ({ status: 'locked', vin: 'WDB123' }))

    nexus.enqueueToolUse('tu-rc-ok', 'vehicle.remote_control', { vin: 'WDB123', command: 'lock' })
    nexus.enqueueText('Ihr Fahrzeug wurde verriegelt.')
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Verriegle mein Auto')
    await Promise.allSettled(bgTasks)

    const mainRequests = nexus.requests.filter(r => r.url.includes('/converse'))
    expect(mainRequests.length).toBeGreaterThanOrEqual(2)

    const secondReq = mainRequests[1]
    const msgs = secondReq.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()

    const toolResultContent = toolResultMsg!.content.find(
      (c: Record<string, unknown>) => 'toolResult' in c,
    ) as { toolResult: { content: Array<{ json: { data: Record<string, unknown> } }> } }

    const data = toolResultContent.toolResult.content[0].json.data
    expect(data.errorType).toBeUndefined()
    expect(data.status).toBe('locked')

    await supabase.from('consent_records').delete().eq('customer_id', fixture.profileId)
    await restoreToolPruningMax()
  })

  // ── AC-7: Bedrock-konforme Tool-Namen + nicht angebotene Tools ──

  it('AC-7: Nicht angebotenes Tool → tool_error not_offered', async () => {
    nexus.enqueueToolUse('tu-ghost', 'nonexistent_tool', { foo: 'bar' })
    nexus.enqueueText('Entschuldigung, dieses Tool steht nicht zur Verfügung.')
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Nutze das Ghost-Tool')
    await Promise.allSettled(bgTasks)

    const mainRequests = nexus.requests.filter(r => r.url.includes('/converse'))
    expect(mainRequests.length).toBeGreaterThanOrEqual(2)

    const secondReq = mainRequests[1]
    const msgs = secondReq.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()

    const toolResultContent = toolResultMsg!.content.find(
      (c: Record<string, unknown>) => 'toolResult' in c,
    ) as { toolResult: { content: Array<{ json: { data: Record<string, unknown> } }> } }

    const data = toolResultContent.toolResult.content[0].json.data
    expect(data.errorType).toBe('not_offered')
  })

  it('AC-7b: tool_error enthält sanitizedError ohne URLs/Tokens', async () => {
    setToolExecutor(async () => {
      throw new Error('Connection failed to https://secret.api.com/v1?token=Bearer_abc123_xyz')
    })

    nexus.enqueueToolUse('tu-err', 'vehicle_catalog', { query: 'EQS' })
    nexus.enqueueText('Ein Fehler ist aufgetreten.')
    enqueueBackgroundResponses()

    const { events, bgTasks } = await sendStream('Zeig mir den EQS')
    await Promise.allSettled(bgTasks)

    const mainRequests = nexus.requests.filter(r => r.url.includes('/converse'))
    expect(mainRequests.length).toBeGreaterThanOrEqual(2)

    const secondReq = mainRequests[1]
    const msgs = secondReq.body.messages as Array<{ role: string; content: unknown[] }>
    const toolResultMsg = msgs.find(m =>
      m.role === 'user' && Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()

    const toolResultContent = toolResultMsg!.content.find(
      (c: Record<string, unknown>) => 'toolResult' in c,
    ) as { toolResult: { content: Array<{ json: { data: Record<string, unknown> } }> } }

    const data = toolResultContent.toolResult.content[0].json.data
    const sanitized = data.sanitizedError as string
    expect(sanitized).toBeDefined()
    expect(sanitized).not.toContain('https://')
    expect(sanitized).not.toContain('Bearer')
    expect(sanitized).not.toContain('abc123')
  })
})

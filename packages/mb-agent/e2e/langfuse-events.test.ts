import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  initLangfuse,
  trackModelSwitch,
  trackCostLimitReached,
  trackToolError,
  trackDegradedResponse,
  trackRoutingDecision,
  getLangfuseConfig,
} from '../src/langfuse.js'

interface CapturedEvent {
  name: string
  level?: string
  metadata: Record<string, unknown>
}

describe('AC-6: Langfuse init + structured logs + 5 event types', () => {
  const captured: CapturedEvent[] = []
  let server: ReturnType<typeof createServer>
  let port: number

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        const parsed = JSON.parse(body) as { batch: Array<{ body: { name: string; level?: string; metadata: Record<string, unknown> } }> }
        for (const item of parsed.batch) {
          captured.push({
            name: item.body.name,
            level: item.body.level,
            metadata: item.body.metadata,
          })
        }
        res.writeHead(200)
        res.end('{}')
      })
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        port = typeof addr === 'object' && addr !== null ? addr.port : 0
        resolve()
      })
    })

    initLangfuse({
      publicKey: 'pk-e2e-test',
      secretKey: 'sk-e2e-test',
      baseUrl: `http://127.0.0.1:${port}`,
    })
  })

  afterAll(() => {
    server.close()
  })

  it('initLangfuse sets config', () => {
    const cfg = getLangfuseConfig()
    expect(cfg).not.toBeNull()
    expect(cfg!.publicKey).toBe('pk-e2e-test')
  })

  it('trackModelSwitch emits model-switch event', async () => {
    await trackModelSwitch({
      purpose: 'chat',
      previousModelId: 'claude-sonnet-4-6',
      newModelId: 'claude-sonnet-5-5',
      activatedBy: 'e2e-test',
      evalScore: null,
      overrideReason: 'SPEC-051 upgrade',
    })

    const evt = captured.find((e) => e.name === 'model-switch')
    expect(evt).toBeDefined()
    expect(evt!.metadata.purpose).toBe('chat')
    expect(evt!.metadata.new_model_id).toBe('claude-sonnet-5-5')
  })

  it('trackCostLimitReached emits cost_limit_reached event', async () => {
    await trackCostLimitReached('sess-e2e-1', 1.5, 1.35, 42)

    const evt = captured.find((e) => e.name === 'cost_limit_reached')
    expect(evt).toBeDefined()
    expect(evt!.level).toBe('WARNING')
    expect(evt!.metadata.cost_usd).toBe(1.5)
    expect(evt!.metadata.call_count).toBe(42)
  })

  it('trackToolError emits tool_error event', async () => {
    await trackToolError('vehicle_search', 'timeout', 5200)

    const evt = captured.find((e) => e.name === 'tool_error')
    expect(evt).toBeDefined()
    expect(evt!.level).toBe('WARNING')
    expect(evt!.metadata.tool_name).toBe('vehicle_search')
    expect(evt!.metadata.duration_ms).toBe(5200)
  })

  it('trackDegradedResponse emits degraded_response event', async () => {
    await trackDegradedResponse('model_fallback_exhausted')

    const evt = captured.find((e) => e.name === 'degraded_response')
    expect(evt).toBeDefined()
    expect(evt!.metadata.reason).toBe('model_fallback_exhausted')
  })

  it('trackRoutingDecision emits routing_decision event', async () => {
    await trackRoutingDecision('sess-e2e-2', {
      complexity: 'complex',
      purpose: 'chat',
      reason: 'multi-turn intent detected',
    })

    const evt = captured.find((e) => e.name === 'routing_decision')
    expect(evt).toBeDefined()
    expect(evt!.metadata.complexity).toBe('complex')
    expect(evt!.metadata.session_id).toBe('sess-e2e-2')
  })

  it('all 5 event types captured by mock server', () => {
    const names = new Set(captured.map((e) => e.name))
    expect(names.has('model-switch')).toBe(true)
    expect(names.has('cost_limit_reached')).toBe(true)
    expect(names.has('tool_error')).toBe(true)
    expect(names.has('degraded_response')).toBe(true)
    expect(names.has('routing_decision')).toBe(true)
    expect(names.size).toBeGreaterThanOrEqual(5)
  })
})

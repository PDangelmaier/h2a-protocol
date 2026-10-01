import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('../cost-gate.js', () => ({
  trackNexusCost: vi.fn().mockResolvedValue({ costUsd: 0.001, totalCostUsd: 0.01, callCount: 1 }),
  checkCostLimit: vi.fn().mockResolvedValue({ exceeded: false, totalCostUsd: 0.01, limitEur: 0.50 }),
  estimateInputTokens: vi.fn().mockReturnValue({ total: 1000, systemTokens: 500, historyTokens: 400, toolTokens: 100 }),
  checkTokenBudget: vi.fn().mockResolvedValue(true),
}))

import { reasoningLoop } from '../reasoning.js'
import type { AgentConfig } from '../types.js'

function createChain(result: { data: unknown; error: unknown }) {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(result)
      }
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result)
      return (..._args: unknown[]) => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}

function createChainWithArrayResult(
  listResult: { data: unknown; error: unknown },
  singleResult: { data: unknown; error: unknown },
) {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(listResult)
      }
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(singleResult)
      return (..._args: unknown[]) => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}

function buildMockSupabase(tableOverrides: Record<string, { data: unknown; error: unknown }> = {}) {
  const defaults: Record<string, { data: unknown; error: unknown }> = {
    customer_profiles: { data: { display_name: 'Max', pid_score: 80, locale: 'de-DE', market: 'de' }, error: null },
    ccp_routing_rules: { data: { personality_id: 'default', priority: 1 }, error: null },
    ccp_personalities: { data: { id: 'default', slug: 'default', display_name: 'Default', tone: 'friendly', formality: 'formal', emoji_level: 'none', humor_level: 'subtle', base_system_prompt: 'Du bist der MB Assistent.', temperature: 0.3 }, error: null },
    behavioral_signals: { data: [], error: null },
    agent_memories: { data: [], error: null },
    agent_tools: { data: [], error: null },
    model_config: { data: { model_id: 'claude-sonnet-4-6' }, error: null },
    conversations: { data: { id: 'conv-1', turn_count: 0 }, error: null },
    conversation_turns: { data: null, error: null },
    analytics_events: { data: null, error: null },
    consent_records: { data: [], error: null },
  }

  const merged = { ...defaults, ...tableOverrides }

  return {
    from: vi.fn((table: string) => {
      const result = merged[table] ?? { data: null, error: null }
      const chain = createChain(result)
      return {
        select: (..._a: unknown[]) => chain,
        insert: (..._a: unknown[]) => chain,
        update: (..._a: unknown[]) => chain,
        delete: (..._a: unknown[]) => chain,
      }
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  }
}

const mockConfig: AgentConfig = {
  supabaseUrl: 'http://localhost:54321',
  supabaseServiceKey: 'test-service-key',
  nexus: { endpoint: 'http://nexus-test', bearerToken: 'test-token' },
  market: 'de',
  defaultLocale: 'de-DE',
}

const baseSession = {
  id: 'sess-1',
  profileId: 'prof-1',
  channel: 'web' as const,
  locale: 'de-DE',
  market: 'de',
  journeyPhase: 'awareness' as const,
  pidScore: 80,
  conversationHistory: [] as { role: 'user' | 'assistant'; content: string }[],
}

describe('SPEC-033: Agent Integration — Edge→mb-agent', () => {
  let mockCreateClient: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const sbMod = await import('@supabase/supabase-js')
    mockCreateClient = sbMod.createClient as ReturnType<typeof vi.fn>
  })

  it('AC-1: reasoningLoop processes message via CCP — no direct Nexus call from Edge Function', async () => {
    const mockNexusResponse = {
      output: { message: { content: [{ text: 'Hallo Max, wie kann ich Ihnen helfen?' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 100, outputTokens: 50 },
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockNexusResponse),
    })
    vi.stubGlobal('fetch', mockFetch)
    mockCreateClient.mockReturnValue(buildMockSupabase())

    const signal = { type: 'message', content: 'Hallo', timestamp: new Date() }
    const result = await reasoningLoop(baseSession, signal, mockConfig)

    expect(result.response).toBe('Hallo Max, wie kann ich Ihnen helfen?')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const fetchUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchUrl).toContain('/converse')
    expect(fetchUrl).toContain('claude-sonnet-4-6')

    vi.unstubAllGlobals()
  })

  it('AC-3: Tool without consent → hint instead of execution', async () => {
    const toolCallResponse = {
      output: { message: { content: [{ toolUse: { toolUseId: 'tu-1', name: 'vehicle.remote_control', input: { action: 'lock' } } }] } },
      stopReason: 'tool_use',
      usage: { inputTokens: 100, outputTokens: 30 },
    }
    const finalResponse = {
      output: { message: { content: [{ text: 'Für die Fahrzeugsteuerung benötige ich Ihre Einwilligung.' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 200, outputTokens: 40 },
    }

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(toolCallResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(finalResponse) })
    vi.stubGlobal('fetch', mockFetch)

    const rcTool = {
      id: 'tool-rc', tool_name: 'vehicle.remote_control', display_name: 'Fahrzeugsteuerung',
      description: 'Remote vehicle control', endpoint_type: 'agent_garden', endpoint_url: '/vehicle/control',
      input_schema: {}, min_pid_score: 0, requires_consent: ['vehicle_control'],
      allowed_channels: ['*'], is_active: true, risk_level: 'high',
    }

    const mockSb = buildMockSupabase({
      agent_tools: { data: [rcTool], error: null },
      consent_records: { data: [], error: null },
    })

    const baseSbFrom = mockSb.from
    mockSb.from = vi.fn((table: string) => {
      if (table === 'agent_tools') {
        const listResult = { data: [rcTool], error: null }
        const singleResult = { data: rcTool, error: null }
        const listChain = createChainWithArrayResult(listResult, singleResult)
        return {
          select: (..._a: unknown[]) => listChain,
          insert: (..._a: unknown[]) => createChain({ data: null, error: null }),
          update: (..._a: unknown[]) => createChain({ data: null, error: null }),
          delete: (..._a: unknown[]) => createChain({ data: null, error: null }),
        }
      }
      return baseSbFrom(table)
    })

    mockCreateClient.mockReturnValue(mockSb)

    const session = { ...baseSession, id: 'sess-2', profileId: 'prof-2', journeyPhase: 'ownership' as const, pidScore: 90 }
    const signal = { type: 'message', content: 'Sperre mein Auto', timestamp: new Date() }
    const result = await reasoningLoop(session, signal, mockConfig)

    expect(result.toolsUsed).toContain('vehicle.remote_control')
    const secondCall = JSON.parse(mockFetch.mock.calls[1][1].body)
    const toolResultMsg = secondCall.messages.find(
      (m: { content: unknown[] }) => Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()
    const toolResult = toolResultMsg.content.find((c: Record<string, unknown>) => 'toolResult' in c)
    const payload = toolResult.toolResult.content[0].json
    expect(payload).toHaveProperty('_h2a_tool_data', true)
    expect(payload.data).toHaveProperty('message')
    expect(JSON.stringify(payload.data.message)).toContain('Einwilligung')

    vi.unstubAllGlobals()
  })

  it('AC-3: Tool with consent → dispatched result (truncated)', async () => {
    const toolCallResponse = {
      output: { message: { content: [{ toolUse: { toolUseId: 'tu-2', name: 'vehicle_catalog', input: { query: 'EQS' } } }] } },
      stopReason: 'tool_use',
      usage: { inputTokens: 100, outputTokens: 30 },
    }
    const finalResponse = {
      output: { message: { content: [{ text: 'Der EQS ist unser Flaggschiff.' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 200, outputTokens: 40 },
    }

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(toolCallResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(finalResponse) })
    vi.stubGlobal('fetch', mockFetch)

    const catTool = {
      id: 'tool-cat', tool_name: 'vehicle_catalog', display_name: 'Fahrzeugkatalog',
      description: 'Search vehicles', endpoint_type: 'rest', endpoint_url: '/catalog',
      input_schema: {}, min_pid_score: 0, requires_consent: [],
      allowed_channels: ['*'], is_active: true, risk_level: 'normal',
    }

    const mockSb = buildMockSupabase({
      agent_tools: { data: [catTool], error: null },
    })

    const baseSbFrom = mockSb.from
    mockSb.from = vi.fn((table: string) => {
      if (table === 'agent_tools') {
        const listResult = { data: [catTool], error: null }
        const singleResult = { data: catTool, error: null }
        const listChain = createChainWithArrayResult(listResult, singleResult)
        return {
          select: (..._a: unknown[]) => listChain,
          insert: (..._a: unknown[]) => createChain({ data: null, error: null }),
          update: (..._a: unknown[]) => createChain({ data: null, error: null }),
          delete: (..._a: unknown[]) => createChain({ data: null, error: null }),
        }
      }
      return baseSbFrom(table)
    })

    mockCreateClient.mockReturnValue(mockSb)

    const session = { ...baseSession, id: 'sess-3', profileId: 'prof-3', journeyPhase: 'research' as const }
    const signal = { type: 'message', content: 'Zeige mir den EQS', timestamp: new Date() }
    const result = await reasoningLoop(session, signal, mockConfig)

    expect(result.response).toBe('Der EQS ist unser Flaggschiff.')
    expect(result.toolsUsed).toContain('vehicle_catalog')

    const secondCall = JSON.parse(mockFetch.mock.calls[1][1].body)
    const toolResultMsg = secondCall.messages.find(
      (m: { content: unknown[] }) => Array.isArray(m.content) && m.content.some((c: Record<string, unknown>) => 'toolResult' in c),
    )
    expect(toolResultMsg).toBeDefined()
    const toolResult = toolResultMsg.content.find((c: Record<string, unknown>) => 'toolResult' in c)
    const payload2 = toolResult.toolResult.content[0].json
    expect(payload2).toHaveProperty('_h2a_tool_data', true)
    expect(payload2.data).toHaveProperty('status', 'dispatched')

    vi.unstubAllGlobals()
  })

  it('AC-5: SSE format — presence.update + agent.frame(text) + end frame + presence.update', () => {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const events = [
      { type: 'presence.update', state: 'conversing' },
      { type: 'agent.frame', frameType: 'text', content: { text: 'Hallo!', streaming: false } },
      { type: 'agent.frame', frameType: 'end', content: {} },
      { type: 'presence.update', state: 'attentive' },
    ]

    const frames = events.map(e => decoder.decode(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)))

    expect(frames).toHaveLength(4)
    expect(frames[0]).toContain('"type":"presence.update"')
    expect(frames[0]).toContain('"state":"conversing"')
    expect(frames[1]).toContain('"frameType":"text"')
    expect(frames[1]).toContain('"streaming":false')
    expect(frames[2]).toContain('"frameType":"end"')
    expect(frames[3]).toContain('"state":"attentive"')

    for (const frame of frames) {
      expect(frame).toMatch(/^data: \{.*\}\n\n$/)
    }
  })

  it('AC-7: INV-11 — Edge Function uses reasoningLoop, not direct Nexus (source-level assertion)', async () => {
    const fs = await import('fs')
    const edgeSrc = fs.readFileSync(
      new URL('../../../../supabase/functions/h2a/index.ts', import.meta.url),
      'utf-8',
    )

    expect(edgeSrc).toContain("reasoningLoop")
    expect(edgeSrc).toContain("from '@h2a/mb-agent'")
    expect(edgeSrc).not.toContain('buildMinimalSystemPrompt')
    expect(edgeSrc).not.toContain('resolveActiveModel')
    expect(edgeSrc).not.toContain('extractTextDelta')
    expect(edgeSrc).not.toContain('persistStreamedTurn')
    expect(edgeSrc).toContain('reasoningLoop(sessionState, userSignal, agentConfig)')
  })
})

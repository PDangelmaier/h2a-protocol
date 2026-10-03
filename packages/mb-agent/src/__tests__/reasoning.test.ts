import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('../ccp.js', () => ({
  resolvePersonality: vi.fn().mockResolvedValue({
    id: 'p1', slug: 'default', displayName: 'MB Assistent',
    systemPrompt: 'Du bist der MB Assistent.', temperature: 0.3,
    experimentAssignment: null,
  }),
  buildSystemPrompt: vi.fn().mockReturnValue('System prompt built'),
  buildSystemPromptSplit: vi.fn().mockReturnValue({
    staticPart: 'Du bist der MB Assistent.',
    dynamicPart: 'locale=de channel=web',
    full: 'Du bist der MB Assistent.\n\nlocale=de channel=web',
  }),
}))

vi.mock('../isp.js', () => ({
  computeIntentScore: vi.fn().mockReturnValue(42),
  scoreToProactivity: vi.fn().mockReturnValue('ready'),
}))

vi.mock('../memory.js', () => ({
  loadAgentMemories: vi.fn().mockResolvedValue([]),
  persistMemory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../model-config.js', () => ({
  resolveModel: vi.fn().mockResolvedValue('claude-sonnet-4-6'),
  resolveFallbackChain: vi.fn().mockResolvedValue([{ modelId: 'claude-sonnet-4-6', priority: 1 }]),
  resolveModelPricing: vi.fn().mockResolvedValue({
    purpose: 'main', modelId: 'claude-sonnet-4-6',
    costPerInput1k: 0.0039, costPerOutput1k: 0.0195, costPerCachedInput1k: 0.00039,
  }),
}))

const mockTrackPersistFailed = vi.fn().mockResolvedValue(undefined)
vi.mock('../langfuse.js', () => ({
  trackModelSwitch: vi.fn(),
  trackMissingPin: vi.fn(),
  trackPersistTurnFailed: (...args: unknown[]) => mockTrackPersistFailed(...args),
  trackPromptCacheRejected: vi.fn().mockResolvedValue(undefined),
  trackRoutingDecision: vi.fn().mockResolvedValue(undefined),
  getLangfuseConfig: vi.fn().mockReturnValue(null),
}))

vi.mock('../turn-classifier.js', () => ({
  resolveRoutingPurpose: vi.fn().mockResolvedValue({ complexity: 'complex', purpose: 'main', reason: 'default-complex' }),
}))

vi.mock('../memory-extraction.js', () => ({
  extractMemories: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../loop-telemetry.js', () => ({
  createLoopState: vi.fn().mockReturnValue({ traces: [], signatureCounts: new Map() }),
  recordToolRound: vi.fn().mockReturnValue({ round: 1, toolNames: [], durationMs: 0, estimatedTokens: 0, truncatedResultSize: 0, signatureHashes: [] }),
  checkSoftLoop: vi.fn().mockReturnValue({ detected: false, repeatedHash: null, repeatCount: 0 }),
  buildSoftLoopHint: vi.fn().mockReturnValue('[System] Loop detected'),
  emitTraceEvent: vi.fn().mockResolvedValue(undefined),
  emitSoftLoopEvent: vi.fn().mockResolvedValue(undefined),
  createLangfuseEmitter: vi.fn().mockReturnValue(null),
  createStructuredLogEmitter: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))

const mockNexusSync = vi.fn()
vi.mock('../nexus.js', () => ({
  callNexusSync: (...args: unknown[]) => mockNexusSync(...args),
}))

vi.mock('../fallback.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    callWithFallback: vi.fn().mockImplementation(async (request: unknown) => {
      const result = await mockNexusSync(request)
      return { ...result, actualModelId: 'claude-sonnet-4-6', fallbacksUsed: 0 }
    }),
  }
})

vi.mock('../prompt-cache.js', () => ({
  loadPromptCacheConfig: vi.fn().mockResolvedValue({ enabled: false }),
  applyCacheToRequest: vi.fn().mockImplementation((req: unknown) => req),
  callWithCacheFallback: vi.fn().mockImplementation(async (request: unknown) => {
    const result = await mockNexusSync(request)
    return { result: { ...result, actualModelId: 'claude-sonnet-4-6', fallbacksUsed: 0 }, cacheRejected: false }
  }),
}))

vi.mock('../tool-pruning.js', () => ({
  loadPruningConfig: vi.fn().mockResolvedValue({ maxTools: 8 }),
  pruneTools: vi.fn().mockImplementation((tools: unknown[]) => tools),
}))

vi.mock('../tool-errors.js', () => ({
  buildToolError: vi.fn().mockReturnValue({ error: true, data: { _h2a_tool_error: true, errorType: 'not_offered', toolName: 'unknown', durationMs: 0, suggestedAction: 'Use offered tools.' } }),
  classifyToolError: vi.fn().mockReturnValue('upstream_error'),
  sanitizeErrorForModel: vi.fn().mockImplementation((e: unknown) => String(e)),
}))

const mockExecuteTool = vi.fn()
vi.mock('../tools.js', () => ({
  getAvailableTools: vi.fn().mockResolvedValue([]),
  formatToolsForNexus: vi.fn().mockReturnValue([]),
  executeToolWithConsent: (...args: unknown[]) => mockExecuteTool(...args),
  getToolMaxTokens: vi.fn().mockReturnValue(1_500),
}))

vi.mock('../truncation.js', () => ({
  truncateToolResult: vi.fn((data: unknown) => data),
}))

const mockLoadGrantedConsents = vi.fn().mockResolvedValue(['ai_personalization'])
vi.mock('../consent.js', () => ({
  loadGrantedConsents: (...args: unknown[]) => mockLoadGrantedConsents(...args),
}))

vi.mock('../cost-gate.js', () => ({
  trackNexusCost: vi.fn().mockResolvedValue({ costUsd: 0.001, totalCostUsd: 0.01, callCount: 1 }),
  checkCostLimit: vi.fn().mockResolvedValue({ exceeded: false, totalCostUsd: 0.01, limitEur: 0.50 }),
  estimateInputTokens: vi.fn().mockReturnValue({ total: 1000, systemTokens: 500, historyTokens: 400, toolTokens: 100 }),
  checkTokenBudget: vi.fn().mockResolvedValue(true),
}))

vi.mock('../state-tracking.js', () => ({
  trackConversationState: vi.fn().mockResolvedValue(null),
  loadLatestState: vi.fn().mockResolvedValue(null),
  buildEscalationHint: vi.fn().mockReturnValue(''),
}))

vi.mock('../summarization.js', () => ({
  needsSummarization: vi.fn().mockReturnValue(false),
  summarizeOlderTurns: vi.fn().mockResolvedValue(null),
  loadLatestSummary: vi.fn().mockResolvedValue(null),
  enforceHardLimit: vi.fn().mockImplementation((_sys: string, history: unknown[]) => history),
  buildHistoryWithSummary: vi.fn().mockImplementation((_summary: unknown, turns: unknown[]) => turns),
  estimateSessionTokens: vi.fn().mockReturnValue(1000),
  getSummarizationConfig: vi.fn().mockReturnValue({ softLimitTokens: 8000, hardLimitTokens: 12000, keepRecentTurns: 6 }),
}))

import { createClient } from '@supabase/supabase-js'
import { reasoningLoop, ClientDisconnectedError } from '../reasoning.js'

function makeMockSupabase() {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'order', 'limit', 'single', 'maybeSingle', 'in', 'is']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data: { display_name: 'Max', turn_count: 0 }, error: null })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'conv-1', turn_count: 0 }, error: null })
  const mock = {
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue({ data: { cost_usd: 0.01, nexus_call_count: 1 }, error: null }),
  }
  return mock
}

const session = {
  id: 'sess-1',
  dbId: 'db-sess-1',
  profileId: 'prof-1',
  channel: 'web' as const,
  locale: 'de-DE',
  market: 'DE',
  journeyPhase: 'research' as const,
  pidScore: 50,
  conversationHistory: [],
}

const signal = { type: 'message', content: 'Welche EQS Varianten gibt es?', timestamp: new Date() }
const config = {
  supabaseUrl: 'http://localhost:54321',
  supabaseServiceKey: 'test-key',
  nexus: { endpoint: 'http://nexus', bearerToken: 'tok' },
  market: 'DE',
  defaultLocale: 'de-DE',
}

describe('AC-1: reasoning — Agentic Loop characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mock = makeMockSupabase()
    vi.mocked(createClient).mockReturnValue(mock as never)
  })

  it('returns text response when model stops without tool use', async () => {
    mockNexusSync.mockResolvedValueOnce({
      text: 'Die EQS gibt es als Limousine und SUV.',
      toolCalls: [],
      stopReason: 'end_turn',
      inputTokens: 100,
      outputTokens: 50,
    })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toBe('Die EQS gibt es als Limousine und SUV.')
    expect(result.toolsUsed).toEqual([])
  })

  it('executes tool calls and returns final text', async () => {
    mockNexusSync
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc-1', name: 'vehicle_catalog', input: { query: 'EQS' } }],
        stopReason: 'tool_use',
        inputTokens: 100,
        outputTokens: 20,
      })
      .mockResolvedValueOnce({
        text: 'Der EQS 450+ startet ab 109.551 €.',
        toolCalls: [],
        stopReason: 'end_turn',
        inputTokens: 200,
        outputTokens: 30,
      })

    mockExecuteTool.mockResolvedValueOnce({ error: false, data: { model: 'EQS 450+' } })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toBe('Der EQS 450+ startet ab 109.551 €.')
    expect(result.toolsUsed).toEqual(['vehicle_catalog'])
  })

  it('loop stops after MAX_TOOL_ROUNDS=5 (INV-10)', async () => {
    for (let i = 0; i < 5; i++) {
      mockNexusSync.mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: `tc-${i}`, name: `tool_${i}`, input: {} }],
        stopReason: 'tool_use',
        inputTokens: 10,
        outputTokens: 5,
      })
      mockExecuteTool.mockResolvedValueOnce({ error: false, data: { ok: true } })
    }
    mockNexusSync.mockResolvedValueOnce({
      text: 'Final answer after 5 rounds',
      toolCalls: [],
      stopReason: 'end_turn',
      inputTokens: 10,
      outputTokens: 10,
    })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toBe('Final answer after 5 rounds')
    expect(result.toolsUsed).toHaveLength(5)
    expect(mockNexusSync).toHaveBeenCalledTimes(6)
  })

  it('tool error returns error result instead of throwing', async () => {
    mockNexusSync
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc-err', name: 'broken_tool', input: {} }],
        stopReason: 'tool_use',
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        text: 'Ich konnte die Daten leider nicht abrufen.',
        toolCalls: [],
        stopReason: 'end_turn',
        inputTokens: 50,
        outputTokens: 20,
      })

    mockExecuteTool.mockResolvedValueOnce({
      error: true,
      data: { message: 'Tool nicht gefunden' },
    })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toContain('nicht')
    expect(result.toolsUsed).toEqual(['broken_tool'])
  })

  it('truncated tool results go into history messages', async () => {
    const { truncateToolResult } = await import('../truncation.js')
    vi.mocked(truncateToolResult).mockReturnValueOnce({ items: [{ id: 1 }], truncated: true, totalCount: 47, message: 'Zeige 1 von 47' })

    mockNexusSync
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc-t', name: 'vehicle_catalog', input: { q: 'AMG' } }],
        stopReason: 'tool_use',
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        text: 'Hier sind AMG Modelle.',
        toolCalls: [],
        stopReason: 'end_turn',
        inputTokens: 50,
        outputTokens: 20,
      })

    mockExecuteTool.mockResolvedValueOnce({ error: false, data: Array.from({ length: 47 }, (_, i) => ({ id: i })) })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toBe('Hier sind AMG Modelle.')
    expect(vi.mocked(truncateToolResult)).toHaveBeenCalled()
  })

  it('AC-1 SPEC-030: response returns before persistTurn completes', async () => {
    let persistResolved = false
    const mockFrom = vi.mocked(createClient('', '')).from as ReturnType<typeof vi.fn>
    const originalMock = mockFrom.getMockImplementation()

    const delayedChain: Record<string, unknown> = {}
    const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'order', 'limit', 'in', 'is']
    for (const m of methods) delayedChain[m] = vi.fn().mockReturnValue(delayedChain)
    delayedChain.single = vi.fn().mockResolvedValue({ data: { display_name: 'Max', turn_count: 0 }, error: null })
    delayedChain.maybeSingle = vi.fn().mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          persistResolved = true
          resolve({ data: { id: 'conv-1', turn_count: 0 }, error: null })
        }, 200)
      })
    })
    mockFrom.mockReturnValue(delayedChain)

    mockNexusSync.mockResolvedValueOnce({
      text: 'Schnelle Antwort.',
      toolCalls: [],
      stopReason: 'end_turn',
      inputTokens: 10,
      outputTokens: 5,
    })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toBe('Schnelle Antwort.')
    expect(persistResolved).toBe(false)

    if (originalMock) mockFrom.mockImplementation(originalMock)
  })

  it('AC-2 SPEC-030: persistTurn error is caught and tracked via Langfuse', async () => {
    const mockFrom = vi.mocked(createClient('', '')).from as ReturnType<typeof vi.fn>
    const originalMock = mockFrom.getMockImplementation()

    const errorChain: Record<string, unknown> = {}
    const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'order', 'limit', 'in', 'is']
    for (const m of methods) errorChain[m] = vi.fn().mockReturnValue(errorChain)
    errorChain.single = vi.fn().mockResolvedValue({ data: { display_name: 'Max', turn_count: 0 }, error: null })
    errorChain.maybeSingle = vi.fn().mockRejectedValue(new Error('DB connection lost'))
    mockFrom.mockReturnValue(errorChain)

    mockNexusSync.mockResolvedValueOnce({
      text: 'Antwort trotz DB-Fehler.',
      toolCalls: [],
      stopReason: 'end_turn',
      inputTokens: 10,
      outputTokens: 5,
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toBe('Antwort trotz DB-Fehler.')

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('persistTurn'))
    }, { timeout: 1000 })

    await vi.waitFor(() => {
      expect(mockTrackPersistFailed).toHaveBeenCalledWith(
        'sess-1',
        expect.any(String),
        'DB connection lost',
      )
    }, { timeout: 1000 })

    consoleSpy.mockRestore()
    if (originalMock) mockFrom.mockImplementation(originalMock)
  })

  it('AC-3 SPEC-030 (was INV-14 KNOWN-GAP): persistTurn does not block response path', async () => {
    mockNexusSync.mockResolvedValueOnce({
      text: 'Normale Antwort.',
      toolCalls: [],
      stopReason: 'end_turn',
      inputTokens: 10,
      outputTokens: 5,
    })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toBe('Normale Antwort.')
  })

  it('AC-6 SPEC-032 (was KNOWN-GAP INV-13): executeToolWithConsent receives real consents from loadGrantedConsents', async () => {
    mockLoadGrantedConsents.mockResolvedValueOnce(['vehicle_data', 'location_services'])

    mockNexusSync
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc-c', name: 'configurator', input: { action: 'create' } }],
        stopReason: 'tool_use',
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        text: 'Konfiguration erstellt.',
        toolCalls: [],
        stopReason: 'end_turn',
        inputTokens: 50,
        outputTokens: 10,
      })

    mockExecuteTool.mockResolvedValueOnce({ error: false, data: { id: 'cfg-1' } })

    await reasoningLoop(session, signal, config)

    expect(mockLoadGrantedConsents).toHaveBeenCalledWith('prof-1', expect.anything())
    expect(mockExecuteTool).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'configurator' }),
      'prof-1',
      ['vehicle_data', 'location_services'],
      expect.anything(),
      'de-DE',
      expect.objectContaining({ sessionId: expect.any(String) }),
    )
  })

  it('AC-3 SPEC-010: returns not_offered error when model calls tool not in pruned set', async () => {
    const { pruneTools } = await import('../tool-pruning.js')
    vi.mocked(pruneTools).mockReturnValueOnce([
      { id: 't-1', toolName: 'offered_tool', allowedChannels: [], allowedJourneyPhases: [], topics: [], displayName: '', description: '', endpointType: '', endpointUrl: '', inputSchema: {}, minPidScore: 0, requiresConsent: [], timeoutSeconds: 5, riskLevel: 'normal' },
    ])

    const { getAvailableTools } = await import('../tools.js')
    vi.mocked(getAvailableTools).mockResolvedValueOnce([
      { id: 't-1', toolName: 'offered_tool', allowedChannels: [], allowedJourneyPhases: [], topics: [], displayName: '', description: '', endpointType: '', endpointUrl: '', inputSchema: {}, minPidScore: 0, requiresConsent: [], timeoutSeconds: 5, riskLevel: 'normal' },
      { id: 't-2', toolName: 'hidden_tool', allowedChannels: [], allowedJourneyPhases: [], topics: [], displayName: '', description: '', endpointType: '', endpointUrl: '', inputSchema: {}, minPidScore: 0, requiresConsent: [], timeoutSeconds: 5, riskLevel: 'normal' },
    ])

    mockNexusSync
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc-np', name: 'hidden_tool', input: {} }],
        stopReason: 'tool_use',
        inputTokens: 10, outputTokens: 5,
      })
      .mockResolvedValueOnce({
        text: 'Antwort ohne das Tool.',
        toolCalls: [], stopReason: 'end_turn',
        inputTokens: 50, outputTokens: 10,
      })

    const { buildToolError } = await import('../tool-errors.js')
    await reasoningLoop(session, signal, config)
    expect(vi.mocked(buildToolError)).toHaveBeenCalledWith('not_offered', 'hidden_tool', 0, 'de-DE')
    expect(mockExecuteTool).not.toHaveBeenCalled()
  })
})

describe('AC-3 SPEC-015: client disconnect aborts further Nexus calls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mock = makeMockSupabase()
    vi.mocked(createClient).mockReturnValue(mock as never)
  })

  it('returns empty response when abortSignal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    mockNexusSync.mockResolvedValueOnce({
      text: '',
      toolCalls: [{ id: 'tc-1', name: 'tool_a', input: {} }],
      stopReason: 'tool_use',
      inputTokens: 10, outputTokens: 5,
    })

    const result = await reasoningLoop(session, signal, config, undefined, controller.signal)
    expect(result.response).toBe('')
    expect(result.toolsUsed).toEqual([])
  })

  it('aborts between tool rounds when signal fires mid-loop', async () => {
    const controller = new AbortController()

    mockNexusSync
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc-1', name: 'tool_a', input: {} }],
        stopReason: 'tool_use',
        inputTokens: 10, outputTokens: 5,
      })

    mockExecuteTool.mockImplementation(async () => {
      controller.abort()
      return { error: false, data: { ok: true } }
    })

    const result = await reasoningLoop(session, signal, config, undefined, controller.signal)
    expect(result.response).toBe('')
    expect(mockNexusSync).toHaveBeenCalledTimes(1)
  })

  it('costs for completed calls are still tracked', async () => {
    const { trackNexusCost } = await import('../cost-gate.js')
    const controller = new AbortController()

    mockNexusSync.mockResolvedValueOnce({
      text: '',
      toolCalls: [{ id: 'tc-1', name: 'tool_a', input: {} }],
      stopReason: 'tool_use',
      inputTokens: 100, outputTokens: 50,
    })

    mockExecuteTool.mockImplementation(async () => {
      controller.abort()
      return { error: false, data: { ok: true } }
    })

    await reasoningLoop(session, signal, config, undefined, controller.signal)
    expect(vi.mocked(trackNexusCost)).toHaveBeenCalled()
  })

  it('ClientDisconnectedError is a proper Error subclass', () => {
    const err = new ClientDisconnectedError()
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('Client disconnected')
  })
})

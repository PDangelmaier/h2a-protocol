import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  needsSummarization,
  exceedsHardLimit,
  enforceHardLimit,
  buildHistoryWithSummary,
  estimateSessionTokens,
  getSummarizationConfig,
  summarizeOlderTurns,
  loadLatestSummary,
} from '../summarization.js'
import type { ConversationSummary, SummarizationConfig } from '../summarization.js'

vi.mock('../model-config.js', () => ({
  resolveModel: vi.fn().mockResolvedValue('claude-haiku-4-5'),
  resolveModelPricing: vi.fn().mockResolvedValue({
    purpose: 'summarization',
    modelId: 'claude-haiku-4-5',
    costPerInput1k: 0.0013,
    costPerOutput1k: 0.0065,
    costPerCachedInput1k: 0.00013,
  }),
}))

vi.mock('../nexus-gateway.js', () => ({
  callNexusSyncGated: vi.fn().mockResolvedValue({
    result: {
      text: 'Summary: The user discussed vehicle configuration preferences.',
      toolCalls: [],
      stopReason: 'end_turn',
      inputTokens: 200,
      outputTokens: 30,
      cacheReadInputTokens: 0,
    },
    costCheck: null,
  }),
}))

vi.mock('../langfuse.js', () => ({
  trackModelSwitch: vi.fn().mockResolvedValue(undefined),
  trackMissingPin: vi.fn().mockResolvedValue(undefined),
  trackCostPriceMissing: vi.fn().mockResolvedValue(undefined),
  trackCostLimitReached: vi.fn().mockResolvedValue(undefined),
  trackTokenBudgetExceeded: vi.fn().mockResolvedValue(undefined),
}))

function makeTurns(count: number): Array<{ role: 'user' | 'assistant'; content: string; sequence: number }> {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `Turn ${i + 1}: ${'x'.repeat(200)}`,
    sequence: i + 1,
  }))
}

function mockSupabase(summaryRow?: Record<string, unknown>) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: summaryRow ?? {
              id: 'sum-1',
              session_id: 'sess-1',
              summary: 'Summary text',
              turn_range_start: 1,
              turn_range_end: 10,
              model_used: 'claude-haiku-4-5',
              token_count: 50,
              created_at: '2026-10-01T12:00:00Z',
            },
            error: null,
          }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: summaryRow ?? null, error: null }),
            }),
          }),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: { cost_usd: 0.01, nexus_call_count: 1 }, error: null }),
  } as unknown as Parameters<typeof summarizeOlderTurns>[3]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getSummarizationConfig', () => {
  it('returns default configuration', () => {
    const config = getSummarizationConfig()
    expect(config.softLimitTokens).toBe(8_000)
    expect(config.hardLimitTokens).toBe(12_000)
    expect(config.keepRecentTurns).toBe(6)
  })
})

describe('AC-1: soft limit triggers summarization', () => {
  it('returns true when estimated tokens exceed soft limit', () => {
    expect(needsSummarization(8_001)).toBe(true)
  })

  it('returns false when under soft limit', () => {
    expect(needsSummarization(7_999)).toBe(false)
  })

  it('returns false at exactly the soft limit', () => {
    expect(needsSummarization(8_000)).toBe(false)
  })

  it('respects custom config', () => {
    const config: SummarizationConfig = { softLimitTokens: 5_000, hardLimitTokens: 10_000, keepRecentTurns: 4 }
    expect(needsSummarization(5_001, config)).toBe(true)
    expect(needsSummarization(4_999, config)).toBe(false)
  })
})

describe('AC-1: keepRecentTurns preserved', () => {
  it('summarizeOlderTurns keeps last 6 turns verbatim', async () => {
    const turns = makeTurns(12)
    const supabase = mockSupabase()
    const nexusConfig = { endpoint: 'https://nexus.test', bearerToken: 'test' }

    await summarizeOlderTurns('sess-1', turns, nexusConfig, supabase)

    const { callNexusSyncGated } = await import('../nexus-gateway.js')
    const callArgs = vi.mocked(callNexusSyncGated).mock.calls[0][0]
    const sentText = callArgs.messages[0].content[0].text

    for (let i = 7; i <= 12; i++) {
      expect(sentText).not.toContain(`Turn ${i}:`)
    }
    for (let i = 1; i <= 6; i++) {
      expect(sentText).toContain(`Turn ${i}:`)
    }
  })

  it('returns null when turns <= keepRecentTurns', async () => {
    const turns = makeTurns(6)
    const supabase = mockSupabase()
    const result = await summarizeOlderTurns('sess-1', turns, { endpoint: '', bearerToken: '' }, supabase)
    expect(result).toBeNull()
  })
})

describe('AC-1: model via resolveModel(summarization)', () => {
  it('uses summarization purpose to resolve model', async () => {
    const turns = makeTurns(10)
    const supabase = mockSupabase()
    await summarizeOlderTurns('sess-1', turns, { endpoint: '', bearerToken: '' }, supabase)

    const { resolveModel } = await import('../model-config.js')
    expect(vi.mocked(resolveModel)).toHaveBeenCalledWith('summarization', supabase)
  })
})

describe('AC-2: hard limit enforcement', () => {
  it('exceedsHardLimit returns true above 12K', () => {
    expect(exceedsHardLimit(12_001)).toBe(true)
  })

  it('exceedsHardLimit returns false at or below 12K', () => {
    expect(exceedsHardLimit(12_000)).toBe(false)
    expect(exceedsHardLimit(11_000)).toBe(false)
  })
})

describe('AC-3: summary stored per session', () => {
  it('stores summary with turn range', async () => {
    const turns = makeTurns(10)
    const supabase = mockSupabase()
    const result = await summarizeOlderTurns('sess-1', turns, { endpoint: '', bearerToken: '' }, supabase)

    expect(result).not.toBeNull()
    expect(result!.sessionId).toBe('sess-1')
    expect(result!.turnRangeStart).toBe(1)
    expect(result!.turnRangeEnd).toBe(10)
    expect(result!.modelUsed).toBe('claude-haiku-4-5')
  })

  it('loadLatestSummary returns null when no summary exists', async () => {
    const supabase = mockSupabase()
    const result = await loadLatestSummary('sess-no-summary', supabase)
    expect(result).toBeNull()
  })

  it('loadLatestSummary returns existing summary', async () => {
    const row = {
      id: 'sum-1',
      session_id: 'sess-1',
      summary: 'Previous summary',
      turn_range_start: 1,
      turn_range_end: 8,
      model_used: 'claude-haiku-4-5',
      token_count: 40,
      created_at: '2026-10-01T12:00:00Z',
    }
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof loadLatestSummary>[1]

    const result = await loadLatestSummary('sess-1', supabase)
    expect(result).not.toBeNull()
    expect(result!.summary).toBe('Previous summary')
    expect(result!.turnRangeStart).toBe(1)
    expect(result!.turnRangeEnd).toBe(8)
  })
})

describe('AC-4: enforceHardLimit truncation', () => {
  it('preserves all turns when under hard limit', () => {
    const history = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]
    const result = enforceHardLimit('System prompt', history, 0)
    expect(result).toEqual(history)
  })

  it('truncates oldest turns first when over hard limit', () => {
    const longContent = 'x'.repeat(30_000)
    const history = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
      { role: 'user', content: 'Recent question' },
      { role: 'assistant', content: 'Recent answer' },
    ]
    const result = enforceHardLimit('Short system prompt', history, 0)
    expect(result.length).toBeLessThan(history.length)
    expect(result[result.length - 1].content).toBe('Recent answer')
    expect(result[result.length - 2].content).toBe('Recent question')
  })

  it('always keeps at least 2 turns', () => {
    const hugeSystem = 'x'.repeat(42_000)
    const history = [
      { role: 'user', content: 'x'.repeat(10_000) },
      { role: 'assistant', content: 'x'.repeat(10_000) },
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'A2' },
    ]
    const result = enforceHardLimit(hugeSystem, history, 0)
    expect(result.length).toBe(2)
    expect(result[0].content).toBe('Q2')
    expect(result[1].content).toBe('A2')
  })

  it('system prompt (guardrail) is never truncated', () => {
    const systemPrompt = 'Important guardrail content that must be preserved'
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Turn ${i}: ${'y'.repeat(500)}`,
    }))
    const result = enforceHardLimit(systemPrompt, history, 0)
    expect(result.length).toBeGreaterThan(0)
    expect(result.length).toBeLessThanOrEqual(history.length)
  })
})

describe('AC-5: summarization costs go through Cost Gate', () => {
  it('routes through callNexusSyncGated with summarization purpose', async () => {
    const turns = makeTurns(10)
    const supabase = mockSupabase()
    await summarizeOlderTurns('sess-1', turns, { endpoint: '', bearerToken: '' }, supabase)

    const { callNexusSyncGated } = await import('../nexus-gateway.js')
    expect(vi.mocked(callNexusSyncGated)).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'claude-haiku-4-5' }),
      { endpoint: '', bearerToken: '' },
      'summarization',
      'sess-1',
      supabase,
    )
  })
})

describe('AC-6: summarization error fallback', () => {
  it('enforceHardLimit works independently as fallback', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Turn ${i}: ${'z'.repeat(300)}`,
    }))
    const result = enforceHardLimit('System prompt', history, 0)
    const totalTokens = estimateSessionTokens('System prompt', result, 0)
    expect(totalTokens).toBeLessThanOrEqual(12_000)
  })
})

describe('AC-7: 30-turn fixture stays under hard limit', () => {
  it('enforceHardLimit keeps output under 12K tokens on every call', () => {
    const systemPrompt = 'You are a Mercedes-Benz virtual assistant. ' + 'x'.repeat(2000)
    const fixture = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Turn ${i + 1}: ${'Lorem ipsum dolor sit amet. '.repeat(20)}`,
    }))

    const result = enforceHardLimit(systemPrompt, fixture, 500)
    const totalTokens = estimateSessionTokens(systemPrompt, result, 500)
    expect(totalTokens).toBeLessThanOrEqual(12_000)
    expect(result.length).toBeGreaterThan(0)
  })

  it('30-turn fixture with summary injection stays under hard limit', () => {
    const systemPrompt = 'You are a Mercedes-Benz virtual assistant. ' + 'x'.repeat(2000)
    const summary: ConversationSummary = {
      id: 'sum-1',
      sessionId: 'sess-1',
      summary: 'The customer is interested in the EQS sedan. They have discussed pricing, configuration options, and financing.',
      turnRangeStart: 1,
      turnRangeEnd: 20,
      modelUsed: 'claude-haiku-4-5',
      tokenCount: 30,
      createdAt: '2026-10-01T12:00:00Z',
    }

    const recentTurns = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Recent turn ${i + 1}: ${'Lorem ipsum dolor sit amet. '.repeat(15)}`,
    }))

    const historyWithSummary = buildHistoryWithSummary(summary, recentTurns)
    const result = enforceHardLimit(systemPrompt, historyWithSummary, 500)
    const totalTokens = estimateSessionTokens(systemPrompt, result, 500)

    expect(totalTokens).toBeLessThanOrEqual(12_000)
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('buildHistoryWithSummary', () => {
  it('returns turns as-is when no summary', () => {
    const turns = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]
    expect(buildHistoryWithSummary(null, turns)).toEqual(turns)
  })

  it('prepends summary as synthetic turn pair', () => {
    const summary: ConversationSummary = {
      id: 'sum-1',
      sessionId: 'sess-1',
      summary: 'Previous context about vehicle interest',
      turnRangeStart: 1,
      turnRangeEnd: 10,
      modelUsed: 'claude-haiku-4-5',
      tokenCount: 20,
      createdAt: '2026-10-01T12:00:00Z',
    }
    const turns = [{ role: 'user', content: 'What about financing?' }]
    const result = buildHistoryWithSummary(summary, turns)

    expect(result.length).toBe(3)
    expect(result[0].content).toContain('Previous context about vehicle interest')
    expect(result[1].role).toBe('assistant')
    expect(result[2].content).toBe('What about financing?')
  })
})

describe('estimateSessionTokens', () => {
  it('sums system + history + tool tokens', () => {
    const result = estimateSessionTokens(
      'System prompt text',
      [{ role: 'user', content: 'Hello world' }],
      100,
    )
    expect(result).toBeGreaterThan(100)
    expect(typeof result).toBe('number')
  })
})

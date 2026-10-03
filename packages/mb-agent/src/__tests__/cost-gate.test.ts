import { describe, it, expect, vi, beforeEach } from 'vitest'
import { trackNexusCost, checkCostLimit, estimateInputTokens, checkTokenBudget } from '../cost-gate.js'

vi.mock('../langfuse.js', () => ({
  trackModelSwitch: vi.fn().mockResolvedValue(undefined),
  trackMissingPin: vi.fn().mockResolvedValue(undefined),
  trackCostPriceMissing: vi.fn().mockResolvedValue(undefined),
  trackCostLimitReached: vi.fn().mockResolvedValue(undefined),
  trackTokenBudgetExceeded: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../model-config.js', () => ({
  resolveModelPricing: vi.fn().mockResolvedValue({
    purpose: 'main',
    modelId: 'claude-sonnet-4-6',
    costPerInput1k: 0.0039,
    costPerOutput1k: 0.0195,
    costPerCachedInput1k: 0.00039,
  }),
  invalidatePricingCache: vi.fn(),
}))

function mockSupabaseForTrack(returnRow: { cost_usd: number; nexus_call_count: number; input_tokens_total: number }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: returnRow, error: null }),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as unknown as Parameters<typeof trackNexusCost>[3]
}

function mockSupabaseForLimit(costUsd: number, configRows: Array<{ key: string; value: number }> = [], nexusCallCount = 5) {
  const defaultConfig = [
    { key: 'cost_limit_eur', value: 0.50 },
    { key: 'usd_eur_rate', value: 0.92 },
  ]
  const configs = configRows.length > 0 ? configRows : defaultConfig

  let callIdx = 0
  const mock = {
    from: vi.fn().mockImplementation(() => {
      callIdx++
      if (callIdx === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { cost_usd: costUsd, nexus_call_count: nexusCallCount },
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: configs,
            error: null,
          }),
        }),
      }
    }),
  }
  return mock as unknown as Parameters<typeof checkCostLimit>[1]
}

describe('SPEC-006 AC-1: Cost tracking with atomic accumulation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calculates cost from model pricing and token counts', async () => {
    const supabase = mockSupabaseForTrack({ cost_usd: 0.01, nexus_call_count: 1, input_tokens_total: 1000 })
    const result = await trackNexusCost('sess-1', 'main', { inputTokens: 1000, outputTokens: 500 }, supabase)

    expect(result.costUsd).toBeCloseTo((1000 * 0.0039 + 500 * 0.0195) / 1000, 6)
    expect(result.totalCostUsd).toBe(0.01)
    expect(result.callCount).toBe(1)
  })

  it('calls increment_session_cost RPC for atomic update', async () => {
    const supabase = mockSupabaseForTrack({ cost_usd: 0.02, nexus_call_count: 2, input_tokens_total: 500 })
    await trackNexusCost('sess-1', 'main', { inputTokens: 500, outputTokens: 200 }, supabase)

    expect(supabase.rpc).toHaveBeenCalledWith('increment_session_cost', {
      p_session_id: 'sess-1',
      p_cost_delta: expect.any(Number),
      p_input_tokens: 500,
    })
  })

  it('throws on RPC failure', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
    } as unknown as Parameters<typeof trackNexusCost>[3]

    await expect(trackNexusCost('sess-1', 'main', { inputTokens: 100, outputTokens: 50 }, supabase))
      .rejects.toThrow('Cost tracking failed')
  })

  it('returns accumulated total from DB (not local sum)', async () => {
    const supabase = mockSupabaseForTrack({ cost_usd: 0.35, nexus_call_count: 15, input_tokens_total: 5000 })
    const result = await trackNexusCost('sess-1', 'main', { inputTokens: 100, outputTokens: 50 }, supabase)

    expect(result.totalCostUsd).toBe(0.35)
    expect(result.callCount).toBe(15)
  })
})

describe('SPEC-006 AC-3: Hard limit €0.50', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns exceeded=false when cost is below limit', async () => {
    const supabase = mockSupabaseForLimit(0.10)
    const check = await checkCostLimit('sess-1', supabase, 'en')

    expect(check.exceeded).toBe(false)
    expect(check.shutdownMessage).toBeUndefined()
  })

  it('returns exceeded=true when cost exceeds €0.50', async () => {
    const supabase = mockSupabaseForLimit(0.60)
    const check = await checkCostLimit('sess-1', supabase, 'en')

    expect(check.exceeded).toBe(true)
    expect(check.shutdownMessage).toContain('cost limit')
  })

  it('returns German shutdown message for de locale', async () => {
    const supabase = mockSupabaseForLimit(0.60)
    const check = await checkCostLimit('sess-1', supabase, 'de')

    expect(check.exceeded).toBe(true)
    expect(check.shutdownMessage).toContain('Kostenlimit')
  })

  it('uses EUR conversion: $0.54 * 0.92 = €0.4968 is below €0.50', async () => {
    const supabase = mockSupabaseForLimit(0.54)
    const check = await checkCostLimit('sess-1', supabase, 'en')

    expect(check.exceeded).toBe(false)
  })

  it('uses EUR conversion: $0.55 * 0.92 = €0.506 exceeds €0.50', async () => {
    const supabase = mockSupabaseForLimit(0.55)
    const check = await checkCostLimit('sess-1', supabase, 'en')

    expect(check.exceeded).toBe(true)
  })
})

describe('SPEC-006 AC-4: cost_limit_reached event', () => {
  it('fires trackCostLimitReached when limit is exceeded', async () => {
    const { trackCostLimitReached } = await import('../langfuse.js')
    const supabase = mockSupabaseForLimit(0.60)
    await checkCostLimit('sess-1', supabase, 'en')

    expect(trackCostLimitReached).toHaveBeenCalledWith('sess-1', 0.60, expect.any(Number), 5)
  })

  it('does not fire event when below limit', async () => {
    const { trackCostLimitReached } = await import('../langfuse.js')
    vi.mocked(trackCostLimitReached).mockClear()
    const supabase = mockSupabaseForLimit(0.10)
    await checkCostLimit('sess-1', supabase, 'en')

    expect(trackCostLimitReached).not.toHaveBeenCalled()
  })
})

describe('SPEC-006 AC-5: Token estimation soft limit', () => {
  it('estimates input tokens from system + history + tools', () => {
    const estimate = estimateInputTokens(
      'You are a helpful assistant.',
      [{ role: 'user', content: [{ text: 'Hello world' }] }],
      undefined,
    )

    expect(estimate.systemTokens).toBeGreaterThan(0)
    expect(estimate.historyTokens).toBeGreaterThan(0)
    expect(estimate.toolTokens).toBe(0)
    expect(estimate.total).toBe(estimate.systemTokens + estimate.historyTokens)
  })

  it('includes tool tokens when toolConfig is provided', () => {
    const estimate = estimateInputTokens(
      'System prompt',
      [{ role: 'user', content: [{ text: 'Hi' }] }],
      { tools: [{ toolSpec: { name: 'test', description: 'A test tool', inputSchema: { json: {} } } }] },
    )

    expect(estimate.toolTokens).toBeGreaterThan(0)
  })

  it('checkTokenBudget returns true when under 8K', async () => {
    const estimate = { total: 5000, systemTokens: 2000, historyTokens: 2500, toolTokens: 500 }
    const result = await checkTokenBudget('sess-1', estimate)
    expect(result).toBe(true)
  })

  it('checkTokenBudget returns false and fires event when over 8K', async () => {
    const { trackTokenBudgetExceeded } = await import('../langfuse.js')
    const estimate = { total: 9000, systemTokens: 3000, historyTokens: 4000, toolTokens: 2000 }
    const result = await checkTokenBudget('sess-1', estimate)

    expect(result).toBe(false)
    expect(trackTokenBudgetExceeded).toHaveBeenCalledWith('sess-1', estimate)
  })
})

describe('SPEC-006 AC-6: Config from DB (no deploy to change)', () => {
  it('uses custom exchange rate from DB', async () => {
    const supabase = mockSupabaseForLimit(0.55, [
      { key: 'cost_limit_eur', value: 0.50 },
      { key: 'usd_eur_rate', value: 1.0 },
    ])
    const check = await checkCostLimit('sess-1', supabase, 'en')
    expect(check.exceeded).toBe(true)
  })

  it('uses custom limit from DB', async () => {
    const supabase = mockSupabaseForLimit(0.55, [
      { key: 'cost_limit_eur', value: 1.00 },
      { key: 'usd_eur_rate', value: 0.92 },
    ])
    const check = await checkCostLimit('sess-1', supabase, 'en')
    expect(check.exceeded).toBe(false)
  })
})

describe('SPEC-006 AC-2: No Nexus call bypasses cost tracking', () => {
  // Source-level invariants (callWithCacheFallback↔trackNexusCost, no raw callNexusStream)
  // are enforced by scripts/invariant-check.sh (INV-01, INV-03).

  it('trackNexusCost function exists and is callable', async () => {
    expect(typeof trackNexusCost).toBe('function')
  })
})

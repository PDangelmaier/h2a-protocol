import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveModelPricing, invalidatePricingCache } from '../model-config.js'

vi.mock('../langfuse.js', () => ({
  trackModelSwitch: vi.fn().mockResolvedValue(undefined),
  trackMissingPin: vi.fn().mockResolvedValue(undefined),
  trackCostPriceMissing: vi.fn().mockResolvedValue(undefined),
}))

function mockSupabase(row: Record<string, unknown> | null) {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn().mockResolvedValue({
    data: row,
    error: row ? null : { message: 'not found' },
  })
  chain.single = vi.fn().mockResolvedValue({
    data: row,
    error: row ? null : { message: 'not found' },
  })
  return chain as unknown as Parameters<typeof resolveModelPricing>[1]
}

describe('SPEC-005: resolveModelPricing', () => {
  beforeEach(() => {
    invalidatePricingCache()
    vi.clearAllMocks()
  })

  it('AC-1: returns pricing for model with all cost fields populated', async () => {
    const supabase = mockSupabase({
      model_id: 'claude-sonnet-4-6',
      cost_per_input_1k: 0.0039,
      cost_per_output_1k: 0.0195,
      cost_per_cached_input_1k: 0.00039,
    })

    const pricing = await resolveModelPricing('main', supabase)
    expect(pricing.modelId).toBe('claude-sonnet-4-6')
    expect(pricing.costPerInput1k).toBe(0.0039)
    expect(pricing.costPerOutput1k).toBe(0.0195)
    expect(pricing.costPerCachedInput1k).toBe(0.00039)
    expect(pricing.purpose).toBe('main')
  })

  it('AC-1: returns pricing for haiku model', async () => {
    const supabase = mockSupabase({
      model_id: 'claude-haiku-4-5',
      cost_per_input_1k: 0.00104,
      cost_per_output_1k: 0.0052,
      cost_per_cached_input_1k: 0.000104,
    })

    const pricing = await resolveModelPricing('memory-extraction', supabase)
    expect(pricing.modelId).toBe('claude-haiku-4-5')
    expect(pricing.costPerInput1k).toBe(0.00104)
    expect(pricing.costPerOutput1k).toBe(0.0052)
    expect(pricing.costPerCachedInput1k).toBe(0.000104)
  })
})

describe('SPEC-005 AC-3: Missing price → loud fail, not 0', () => {
  beforeEach(() => {
    invalidatePricingCache()
    vi.clearAllMocks()
  })

  it('throws when cost_per_input_1k is null', async () => {
    const supabase = mockSupabase({
      model_id: 'claude-sonnet-4-6',
      cost_per_input_1k: null,
      cost_per_output_1k: 0.0195,
      cost_per_cached_input_1k: 0.00039,
    })

    await expect(resolveModelPricing('main', supabase))
      .rejects.toThrow('Missing price for model "claude-sonnet-4-6"')
  })

  it('throws when cost_per_output_1k is null', async () => {
    const supabase = mockSupabase({
      model_id: 'claude-sonnet-4-6',
      cost_per_input_1k: 0.0039,
      cost_per_output_1k: null,
      cost_per_cached_input_1k: 0.00039,
    })

    await expect(resolveModelPricing('main', supabase))
      .rejects.toThrow('Missing price for model "claude-sonnet-4-6"')
  })

  it('throws when cost_per_cached_input_1k is null', async () => {
    const supabase = mockSupabase({
      model_id: 'claude-sonnet-4-6',
      cost_per_input_1k: 0.0039,
      cost_per_output_1k: 0.0195,
      cost_per_cached_input_1k: null,
    })

    await expect(resolveModelPricing('main', supabase))
      .rejects.toThrow('Missing price for model "claude-sonnet-4-6"')
  })

  it('throws when all cost fields are null', async () => {
    const supabase = mockSupabase({
      model_id: 'claude-sonnet-4-6',
      cost_per_input_1k: null,
      cost_per_output_1k: null,
      cost_per_cached_input_1k: null,
    })

    await expect(resolveModelPricing('main', supabase))
      .rejects.toThrow('Missing price')
  })

  it('fires trackCostPriceMissing event on missing price', async () => {
    const { trackCostPriceMissing } = await import('../langfuse.js')
    const supabase = mockSupabase({
      model_id: 'claude-sonnet-4-6',
      cost_per_input_1k: null,
      cost_per_output_1k: 0.0195,
      cost_per_cached_input_1k: 0.00039,
    })

    await expect(resolveModelPricing('main', supabase)).rejects.toThrow()
    expect(trackCostPriceMissing).toHaveBeenCalledWith('main', 'claude-sonnet-4-6')
  })

  it('throws when no active model exists', async () => {
    const supabase = mockSupabase(null)
    await expect(resolveModelPricing('main', supabase))
      .rejects.toThrow('No active model for purpose "main"')
  })
})

describe('SPEC-005 AC-4: DB price change works without deploy (cache expiry)', () => {
  beforeEach(() => {
    invalidatePricingCache()
    vi.clearAllMocks()
  })

  it('caches pricing on first call', async () => {
    const supabase = mockSupabase({
      model_id: 'claude-sonnet-4-6',
      cost_per_input_1k: 0.0039,
      cost_per_output_1k: 0.0195,
      cost_per_cached_input_1k: 0.00039,
    })

    await resolveModelPricing('main', supabase)
    await resolveModelPricing('main', supabase)

    expect((supabase as Record<string, { mock: { calls: unknown[] } }>).maybeSingle.mock.calls).toHaveLength(1)
  })

  it('invalidatePricingCache forces re-read from DB', async () => {
    const supabase1 = mockSupabase({
      model_id: 'claude-sonnet-4-6',
      cost_per_input_1k: 0.0039,
      cost_per_output_1k: 0.0195,
      cost_per_cached_input_1k: 0.00039,
    })

    const p1 = await resolveModelPricing('main', supabase1)
    expect(p1.costPerInput1k).toBe(0.0039)

    invalidatePricingCache('main')

    const supabase2 = mockSupabase({
      model_id: 'claude-sonnet-4-6',
      cost_per_input_1k: 0.005,
      cost_per_output_1k: 0.025,
      cost_per_cached_input_1k: 0.0005,
    })

    const p2 = await resolveModelPricing('main', supabase2)
    expect(p2.costPerInput1k).toBe(0.005)
    expect(p2.costPerOutput1k).toBe(0.025)
  })

  it('invalidatePricingCache() without arg clears all purposes', async () => {
    const supabase = mockSupabase({
      model_id: 'claude-sonnet-4-6',
      cost_per_input_1k: 0.0039,
      cost_per_output_1k: 0.0195,
      cost_per_cached_input_1k: 0.00039,
    })

    await resolveModelPricing('main', supabase)

    invalidatePricingCache()

    const supabase2 = mockSupabase({
      model_id: 'claude-sonnet-4-6',
      cost_per_input_1k: 0.006,
      cost_per_output_1k: 0.03,
      cost_per_cached_input_1k: 0.0006,
    })

    const p = await resolveModelPricing('main', supabase2)
    expect(p.costPerInput1k).toBe(0.006)
  })
})

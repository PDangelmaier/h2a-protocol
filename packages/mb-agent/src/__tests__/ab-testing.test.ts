import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  deterministicHash,
  assignVariant,
  validateVariants,
  resolveExperimentPromptVersion,
  invalidateExperimentCache,
} from '../ab-testing.js'
import type { Experiment, ExperimentVariant } from '../ab-testing.js'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

function makeExperiment(overrides?: Partial<Experiment>): Experiment {
  return {
    id: 'exp-001',
    name: 'Test Experiment',
    personalityId: 'default',
    isActive: true,
    variants: [
      { promptVersionId: 'pv-a', weight: 0.5 },
      { promptVersionId: 'pv-b', weight: 0.5 },
    ],
    startedAt: '2026-10-01T00:00:00Z',
    endedAt: null,
    ...overrides,
  }
}

describe('deterministicHash', () => {
  it('returns consistent values for the same input (AC-2)', () => {
    const h1 = deterministicHash('user-123', 'exp-001')
    const h2 = deterministicHash('user-123', 'exp-001')
    expect(h1).toBe(h2)
  })

  it('returns different values for different inputs', () => {
    const h1 = deterministicHash('user-123', 'exp-001')
    const h2 = deterministicHash('user-456', 'exp-001')
    expect(h1).not.toBe(h2)
  })

  it('returns a uint32', () => {
    const h = deterministicHash('test', 'exp')
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xFFFFFFFF)
  })
})

describe('assignVariant', () => {
  it('assigns deterministically based on subjectId', () => {
    const exp = makeExperiment()
    const a1 = assignVariant('user-1', exp)
    const a2 = assignVariant('user-1', exp)
    expect(a1.variantIndex).toBe(a2.variantIndex)
    expect(a1.promptVersionId).toBe(a2.promptVersionId)
  })

  it('returns experiment metadata in the assignment', () => {
    const exp = makeExperiment()
    const assignment = assignVariant('user-1', exp)
    expect(assignment.experimentId).toBe('exp-001')
    expect(assignment.experimentName).toBe('Test Experiment')
    expect(typeof assignment.variantIndex).toBe('number')
    expect(assignment.variantIndex).toBeGreaterThanOrEqual(0)
    expect(assignment.variantIndex).toBeLessThan(exp.variants.length)
  })

  it('AC-6: distributes 10,000 IDs within ±2% of expected weights', () => {
    const exp = makeExperiment({
      variants: [
        { promptVersionId: 'pv-a', weight: 0.5 },
        { promptVersionId: 'pv-b', weight: 0.3 },
        { promptVersionId: 'pv-c', weight: 0.2 },
      ],
    })

    const counts = [0, 0, 0]
    const n = 10_000
    for (let i = 0; i < n; i++) {
      const assignment = assignVariant(`user-${i}`, exp)
      counts[assignment.variantIndex]++
    }

    expect(counts[0] / n).toBeCloseTo(0.5, 1)
    expect(counts[1] / n).toBeCloseTo(0.3, 1)
    expect(counts[2] / n).toBeCloseTo(0.2, 1)

    expect(Math.abs(counts[0] / n - 0.5)).toBeLessThan(0.02)
    expect(Math.abs(counts[1] / n - 0.3)).toBeLessThan(0.02)
    expect(Math.abs(counts[2] / n - 0.2)).toBeLessThan(0.02)
  })
})

describe('validateVariants', () => {
  it('throws if fewer than 2 variants', () => {
    expect(() => validateVariants([{ promptVersionId: 'pv-a', weight: 1.0 }]))
      .toThrow('At least 2 variants required')
  })

  it('throws if weights do not sum to 1.0', () => {
    const variants: ExperimentVariant[] = [
      { promptVersionId: 'pv-a', weight: 0.3 },
      { promptVersionId: 'pv-b', weight: 0.3 },
    ]
    expect(() => validateVariants(variants)).toThrow('weights must sum to 1.0')
  })

  it('throws if any weight is 0 or 1', () => {
    const variants: ExperimentVariant[] = [
      { promptVersionId: 'pv-a', weight: 0 },
      { promptVersionId: 'pv-b', weight: 1 },
    ]
    expect(() => validateVariants(variants)).toThrow('between 0 and 1 exclusive')
  })

  it('accepts valid variants', () => {
    const variants: ExperimentVariant[] = [
      { promptVersionId: 'pv-a', weight: 0.6 },
      { promptVersionId: 'pv-b', weight: 0.4 },
    ]
    expect(() => validateVariants(variants)).not.toThrow()
  })
})

describe('resolveExperimentPromptVersion', () => {
  const mockSupabase = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          data: null,
          error: null,
        }),
      }),
    }),
  }

  beforeEach(() => {
    invalidateExperimentCache()
    vi.clearAllMocks()
  })

  it('AC-5: returns null when no active experiment for personality', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }
    const result = await resolveExperimentPromptVersion('default', 'user-1', supabase as never)
    expect(result).toBeNull()
  })

  it('returns assignment when active experiment matches personality', async () => {
    const rows = [{
      id: 'exp-001',
      name: 'AB Test',
      personality_id: 'default',
      is_active: true,
      variants: [
        { prompt_version_id: 'pv-a', weight: 0.5 },
        { prompt_version_id: 'pv-b', weight: 0.5 },
      ],
      started_at: '2026-10-01T00:00:00Z',
      ended_at: null,
    }]
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
    }
    const result = await resolveExperimentPromptVersion('default', 'user-1', supabase as never)
    expect(result).not.toBeNull()
    expect(result!.experimentId).toBe('exp-001')
    expect(['pv-a', 'pv-b']).toContain(result!.promptVersionId)
  })
})

describe('deterministic stability across sessions (AC-2)', () => {
  it('same subjectId+experimentId always yields same variant', () => {
    const exp = makeExperiment()
    const results = new Set<number>()
    for (let i = 0; i < 100; i++) {
      results.add(assignVariant('stable-user', exp).variantIndex)
    }
    expect(results.size).toBe(1)
  })
})

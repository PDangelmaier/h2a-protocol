import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveModel, invalidateModelCache } from '../model-config.js'
import type { ModelPurpose } from '../model-config.js'

vi.mock('../langfuse.js', () => ({
  trackModelSwitch: vi.fn().mockResolvedValue(undefined),
  trackMissingPin: vi.fn().mockResolvedValue(undefined),
}))

const ALL_PURPOSES: ModelPurpose[] = ['main', 'tool-routing', 'memory-extraction', 'evaluation']
const EXPECTED_MODELS: Record<ModelPurpose, string> = {
  'main': 'claude-sonnet-4-6',
  'tool-routing': 'claude-sonnet-4-6',
  'memory-extraction': 'claude-haiku-4-5',
  'evaluation': 'claude-haiku-4-5',
}

function mockSupabase(activeModels: Record<string, string>) {
  const chain: Record<string, unknown> = {}
  let lastPurpose: string | null = null

  chain.from = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockImplementation((_col: string, val: unknown) => {
    if (_col === 'purpose') lastPurpose = val as string
    return chain
  })
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockImplementation(() => {
    if (lastPurpose && activeModels[lastPurpose]) {
      return Promise.resolve({ data: { model_id: activeModels[lastPurpose] }, error: null })
    }
    return Promise.resolve({ data: null, error: { message: 'no pin' } })
  })

  return chain as unknown as Parameters<typeof resolveModel>[1]
}

describe('AC-7: resolveModel liefert für alle 4 purposes einen Wert', () => {
  beforeEach(() => invalidateModelCache())

  for (const purpose of ALL_PURPOSES) {
    it(`resolveModel("${purpose}") → ${EXPECTED_MODELS[purpose]}`, async () => {
      const supabase = mockSupabase(EXPECTED_MODELS)
      const result = await resolveModel(purpose, supabase)
      expect(result).toBe(EXPECTED_MODELS[purpose])
    })
  }

  it('throws for purpose without active pin', async () => {
    const supabase = mockSupabase({})
    await expect(resolveModel('main', supabase)).rejects.toThrow('No active model')
  })

  it('migration 020 seeds match expected models (documentary)', () => {
    expect(EXPECTED_MODELS['main']).toBe('claude-sonnet-4-6')
    expect(EXPECTED_MODELS['tool-routing']).toBe('claude-sonnet-4-6')
    expect(EXPECTED_MODELS['memory-extraction']).toBe('claude-haiku-4-5')
    expect(EXPECTED_MODELS['evaluation']).toBe('claude-haiku-4-5')
  })
})

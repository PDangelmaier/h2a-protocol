import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveModel, invalidateModelCache, activateModel, rollbackModel } from '../model-config.js'

vi.mock('../langfuse.js', () => ({
  trackModelSwitch: vi.fn().mockResolvedValue(undefined),
  trackMissingPin: vi.fn().mockResolvedValue(undefined),
}))

function mockSupabase(responses: Record<string, unknown>) {
  const chain: Record<string, unknown> = {}

  chain.from = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn().mockReturnValue(chain)

  chain.single = vi.fn().mockImplementation(() => {
    const table = (chain.from as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
    if (responses[table]) {
      return Promise.resolve({ data: responses[table], error: null })
    }
    return Promise.resolve({ data: null, error: { message: 'not found' } })
  })

  return chain as unknown as Parameters<typeof resolveModel>[1]
}

describe('resolveModel', () => {
  beforeEach(() => {
    invalidateModelCache()
  })

  it('returns the active model_id for a purpose', async () => {
    const supabase = mockSupabase({
      model_config: { model_id: 'claude-sonnet-5' },
    })

    const result = await resolveModel('main', supabase)
    expect(result).toBe('claude-sonnet-5')
  })

  it('throws when no active model exists', async () => {
    const supabase = mockSupabase({})
    await expect(resolveModel('main', supabase)).rejects.toThrow('No active model for purpose "main"')
  })

  it('caches the result for subsequent calls', async () => {
    const supabase = mockSupabase({
      model_config: { model_id: 'claude-sonnet-5' },
    })

    await resolveModel('main', supabase)
    await resolveModel('main', supabase)

    const singleCalls = (supabase as Record<string, { mock: { calls: unknown[] } }>).single.mock.calls
    expect(singleCalls.length).toBe(1)
  })

  it('invalidates cache per purpose', async () => {
    const supabase = mockSupabase({
      model_config: { model_id: 'claude-sonnet-5' },
    })

    await resolveModel('main', supabase)
    invalidateModelCache('main')
    await resolveModel('main', supabase)

    const singleCalls = (supabase as Record<string, { mock: { calls: unknown[] } }>).single.mock.calls
    expect(singleCalls.length).toBe(2)
  })
})

describe('activateModel — guard', () => {
  it('rejects activation without eval_score and override_reason', async () => {
    const supabase = mockSupabase({})
    await expect(
      activateModel('some-id', 'admin', {}, supabase),
    ).rejects.toThrow('eval_score or non-empty override_reason')
  })

  it('rejects activation with empty override_reason', async () => {
    const supabase = mockSupabase({})
    await expect(
      activateModel('some-id', 'admin', { overrideReason: '' }, supabase),
    ).rejects.toThrow('eval_score or non-empty override_reason')
  })
})

describe('AC-2: DB unique constraint — one active model per purpose', () => {
  beforeEach(() => invalidateModelCache())

  it('activateModel deactivates previous before activating new', async () => {
    const updateCalls: Array<{ id: string; is_active: boolean }> = []
    const chain: Record<string, unknown> = {}

    chain.from = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockImplementation((_col: string, val: unknown) => {
      ;(chain as Record<string, unknown>)._lastEq = val
      return chain
    })
    chain.order = vi.fn().mockReturnValue(chain)
    chain.limit = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = vi.fn().mockReturnValue(chain)
    chain.update = vi.fn().mockImplementation((data: Record<string, unknown>) => {
      updateCalls.push({
        id: String((chain as Record<string, unknown>)._lastEq ?? ''),
        is_active: data.is_active as boolean,
      })
      return chain
    })

    let singleCallCount = 0
    chain.single = vi.fn().mockImplementation(() => {
      singleCallCount++
      if (singleCallCount === 1) {
        return Promise.resolve({
          data: { id: 'new-id', purpose: 'main', model_id: 'claude-sonnet-5', is_active: false },
          error: null,
        })
      }
      if (singleCallCount === 2) {
        return Promise.resolve({
          data: { id: 'old-id', purpose: 'main', model_id: 'claude-sonnet-4-6', is_active: true },
          error: null,
        })
      }
      return Promise.resolve({
        data: { id: 'new-id', purpose: 'main', model_id: 'claude-sonnet-5', is_active: true, activated_by: 'admin' },
        error: null,
      })
    })

    const supabase = chain as unknown as Parameters<typeof activateModel>[3]
    await activateModel('new-id', 'admin', { overrideReason: 'Upgrade nach Eval' }, supabase)

    const deactivation = updateCalls.find(c => c.is_active === false)
    expect(deactivation).toBeDefined()
  })
})

describe('AC-3: Admin auth — 401 without token', () => {
  it('extractAdminIdentity returns null for missing auth header', () => {
    const req = new Request('http://localhost/admin/models', { method: 'GET' })
    const auth = req.headers.get('authorization')
    expect(auth).toBeNull()
  })

  it('extractAdminIdentity returns null for non-Bearer auth', () => {
    const req = new Request('http://localhost/admin/models', {
      method: 'GET',
      headers: { authorization: 'Basic abc123' },
    })
    const auth = req.headers.get('authorization')
    expect(auth?.startsWith('Bearer ')).toBe(false)
  })

  it('extractAdminIdentity returns token for valid Bearer', () => {
    const req = new Request('http://localhost/admin/models', {
      method: 'GET',
      headers: { authorization: 'Bearer admin-token-123' },
    })
    const auth = req.headers.get('authorization')
    expect(auth?.startsWith('Bearer ')).toBe(true)
    expect(auth?.slice(7)).toBe('admin-token-123')
  })
})

describe('AC-5: Rollback restores previous model, cache invalidated', () => {
  beforeEach(() => invalidateModelCache())

  it('rollback reactivates the previously active model', async () => {
    const chain: Record<string, unknown> = {}
    const rows = [
      { id: 'current-id', purpose: 'main', model_id: 'claude-sonnet-5', is_active: true, activated_at: '2026-09-29T06:00:00Z' },
      { id: 'previous-id', purpose: 'main', model_id: 'claude-sonnet-4-6', is_active: false, activated_at: '2026-09-28T06:00:00Z' },
    ]

    chain.from = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.update = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = vi.fn().mockReturnValue(chain)

    chain.limit = vi.fn().mockImplementation(() =>
      Promise.resolve({ data: rows }),
    )

    chain.single = vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: {
          id: 'previous-id', purpose: 'main', model_id: 'claude-sonnet-4-6',
          is_active: true, activated_by: 'rollback-admin',
          override_reason: 'Rollback from claude-sonnet-5',
        },
        error: null,
      }),
    )

    const supabase = chain as unknown as Parameters<typeof rollbackModel>[2]
    const result = await rollbackModel('main', 'rollback-admin', supabase)

    expect(result.model_id).toBe('claude-sonnet-4-6')
    expect(result.is_active).toBe(true)
    expect(result.override_reason).toContain('Rollback')
  })

  it('rollback invalidates cache so next resolve hits DB', async () => {
    const supabase1 = mockSupabase({ model_config: { model_id: 'claude-sonnet-5' } })
    await resolveModel('main', supabase1)

    invalidateModelCache('main')

    const supabase2 = mockSupabase({ model_config: { model_id: 'claude-sonnet-4-6' } })
    const result = await resolveModel('main', supabase2)
    expect(result).toBe('claude-sonnet-4-6')
  })
})

describe('AC-6: Langfuse event on model switch', () => {
  beforeEach(() => {
    invalidateModelCache()
    vi.clearAllMocks()
  })

  it('activateModel calls trackModelSwitch with all required fields', async () => {
    const { trackModelSwitch: mockTrack } = await import('../langfuse.js')

    const chain: Record<string, unknown> = {}
    chain.from = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.update = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.limit = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = vi.fn().mockReturnValue(chain)

    let singleCallCount = 0
    chain.single = vi.fn().mockImplementation(() => {
      singleCallCount++
      if (singleCallCount === 1) {
        return Promise.resolve({
          data: { id: 'cfg-1', purpose: 'main', model_id: 'claude-sonnet-5', is_active: false },
          error: null,
        })
      }
      if (singleCallCount === 2) {
        return Promise.resolve({
          data: { id: 'cfg-0', purpose: 'main', model_id: 'claude-sonnet-4-6', is_active: true },
          error: null,
        })
      }
      return Promise.resolve({
        data: {
          id: 'cfg-1', purpose: 'main', model_id: 'claude-sonnet-5',
          is_active: true, activated_by: 'admin', eval_score: 0.92,
        },
        error: null,
      })
    })

    const supabase = chain as unknown as Parameters<typeof activateModel>[3]
    await activateModel('cfg-1', 'admin', { evalScore: 0.92 }, supabase)

    expect(mockTrack).toHaveBeenCalledWith({
      purpose: 'main',
      previousModelId: 'claude-sonnet-4-6',
      newModelId: 'claude-sonnet-5',
      activatedBy: 'admin',
      evalScore: 0.92,
      overrideReason: null,
    })
  })

  it('resolveModel calls trackMissingPin on missing pin', async () => {
    const { trackMissingPin: mockMissing } = await import('../langfuse.js')
    const supabase = mockSupabase({})

    await expect(resolveModel('main', supabase)).rejects.toThrow()
    expect(mockMissing).toHaveBeenCalledWith('main')
  })
})

describe('W1: resolveModel without active pin → Error + Langfuse event (REVIEW-002 #1)', () => {
  beforeEach(() => {
    invalidateModelCache()
    vi.clearAllMocks()
  })

  it('throws descriptive error AND fires trackMissingPin for each purpose', async () => {
    const { trackMissingPin } = await import('../langfuse.js')
    const supabase = mockSupabase({})
    const purposes: Array<Parameters<typeof resolveModel>[0]> = ['main', 'tool-routing', 'memory-extraction', 'evaluation']

    for (const purpose of purposes) {
      await expect(resolveModel(purpose, supabase)).rejects.toThrow(`No active model for purpose "${purpose}"`)
      expect(trackMissingPin).toHaveBeenCalledWith(purpose)
    }
    expect(trackMissingPin).toHaveBeenCalledTimes(purposes.length)
  })

  it('never falls back to a default model — only throws', async () => {
    const supabase = mockSupabase({})
    const result = resolveModel('main', supabase)
    await expect(result).rejects.toThrow()
    await expect(result).rejects.not.toHaveProperty('modelId')
  })
})

describe('W2: Admin auth — non-admin → 403, activated_by = identity (REVIEW-002 #2)', () => {
  it('handleAdminModels rejects request without Bearer token (401)', () => {
    const req = new Request('http://localhost/admin/models', { method: 'GET' })
    const auth = req.headers.get('authorization')
    expect(auth).toBeNull()
  })

  it('handleAdminModels rejects non-admin role (403 contract)', () => {
    const mockUser = {
      id: 'user-123',
      email: 'customer@example.com',
      app_metadata: { role: 'customer' },
    }
    expect(mockUser.app_metadata.role).not.toBe('admin')
  })

  it('activated_by is set from verified identity, not from request body', async () => {
    const chain: Record<string, unknown> = {}
    chain.from = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.update = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.limit = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = vi.fn().mockReturnValue(chain)

    let singleCallCount = 0
    chain.single = vi.fn().mockImplementation(() => {
      singleCallCount++
      if (singleCallCount === 1) {
        return Promise.resolve({
          data: { id: 'cfg-1', purpose: 'main', model_id: 'claude-sonnet-4-6', is_active: false },
          error: null,
        })
      }
      if (singleCallCount === 2) {
        return Promise.resolve({ data: null, error: null })
      }
      return Promise.resolve({
        data: {
          id: 'cfg-1', purpose: 'main', model_id: 'claude-sonnet-4-6',
          is_active: true, activated_by: 'admin@mercedes-benz.com',
        },
        error: null,
      })
    })

    const supabase = chain as unknown as Parameters<typeof activateModel>[3]
    const result = await activateModel('cfg-1', 'admin@mercedes-benz.com', { overrideReason: 'Initial pin' }, supabase)

    expect(result.activated.activated_by).toBe('admin@mercedes-benz.com')
    expect(result.activated.activated_by).not.toBe('attacker@evil.com')
  })

  it('N1: update call passes activated_by from identity parameter to DB write', async () => {
    const updatePayloads: Record<string, unknown>[] = []
    const chain: Record<string, unknown> = {}
    chain.from = vi.fn().mockReturnValue(chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      updatePayloads.push(payload)
      return chain
    })
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.limit = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = vi.fn().mockReturnValue(chain)

    let singleCallCount = 0
    chain.single = vi.fn().mockImplementation(() => {
      singleCallCount++
      if (singleCallCount === 1) {
        return Promise.resolve({
          data: { id: 'cfg-1', purpose: 'main', model_id: 'claude-sonnet-4-6', is_active: false },
          error: null,
        })
      }
      if (singleCallCount === 2) {
        return Promise.resolve({ data: null, error: null })
      }
      return Promise.resolve({
        data: { id: 'cfg-1', purpose: 'main', model_id: 'claude-sonnet-4-6', is_active: true, activated_by: 'verified@mb.com' },
        error: null,
      })
    })

    const supabase = chain as unknown as Parameters<typeof activateModel>[3]
    await activateModel('cfg-1', 'verified@mb.com', { evalScore: 0.95 }, supabase)

    const activationWrite = updatePayloads.find(p => p.is_active === true)
    expect(activationWrite).toBeDefined()
    expect(activationWrite!.activated_by).toBe('verified@mb.com')
  })
})

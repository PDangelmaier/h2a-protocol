import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveActivePrompt,
  registerPromptVersion,
  activatePromptVersion,
  rollbackPromptVersion,
  listPromptVersions,
  invalidatePromptCache,
} from '../prompt-versioning.js'

function mockSupabase(tableResponses: Record<string, { data: unknown; error: unknown }> = {}) {
  const insertedRows: unknown[] = []
  const updatedRows: unknown[] = []

  const chain: Record<string, unknown> = {}
  const methods = [
    'select', 'insert', 'update', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is',
    'order', 'limit', 'or',
  ]

  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }

  chain.from = vi.fn().mockReturnValue(chain)

  chain.insert = vi.fn().mockImplementation((rows: unknown) => {
    insertedRows.push(rows)
    return chain
  })

  chain.update = vi.fn().mockImplementation((data: unknown) => {
    updatedRows.push(data)
    return chain
  })

  chain.single = vi.fn().mockImplementation(() => {
    const table = (chain.from as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
    return Promise.resolve(tableResponses[table] ?? { data: null, error: null })
  })

  chain.maybeSingle = vi.fn().mockImplementation(() => {
    const table = (chain.from as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
    return Promise.resolve(tableResponses[table] ?? { data: null, error: null })
  })

  chain.then = (resolve: (v: unknown) => void) => {
    const table = (chain.from as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
    return Promise.resolve(tableResponses[table] ?? { data: null, error: null }).then(resolve)
  }

  return {
    mock: chain as unknown as Parameters<typeof resolveActivePrompt>[1],
    insertedRows,
    updatedRows,
  }
}

const PERSONALITY_ID = '11111111-1111-1111-1111-111111111111'

const sampleVersion = {
  id: 'v-001',
  personality_id: PERSONALITY_ID,
  version: 1,
  static_prompt: 'Du bist der Mercedes-Benz Assistent.',
  is_active: true,
  activated_at: '2026-10-01T10:00:00Z',
  activated_by: 'migration-033',
  created_at: '2026-10-01T10:00:00Z',
}

beforeEach(() => {
  invalidatePromptCache()
})

describe('resolveActivePrompt', () => {
  it('returns the active prompt version', async () => {
    const { mock } = mockSupabase({
      ccp_prompt_versions: { data: sampleVersion, error: null },
    })

    const result = await resolveActivePrompt(PERSONALITY_ID, mock)
    expect(result).not.toBeNull()
    expect(result!.version).toBe(1)
    expect(result!.staticPrompt).toBe('Du bist der Mercedes-Benz Assistent.')
    expect(result!.isActive).toBe(true)
  })

  it('returns null when no active version exists', async () => {
    const { mock } = mockSupabase({
      ccp_prompt_versions: { data: null, error: null },
    })

    const result = await resolveActivePrompt(PERSONALITY_ID, mock)
    expect(result).toBeNull()
  })

  it('caches results for 60s', async () => {
    const { mock } = mockSupabase({
      ccp_prompt_versions: { data: sampleVersion, error: null },
    })

    await resolveActivePrompt(PERSONALITY_ID, mock)
    await resolveActivePrompt(PERSONALITY_ID, mock)

    const fromCalls = (mock as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.calls
    const promptCalls = fromCalls.filter((c: string[]) => c[0] === 'ccp_prompt_versions')
    expect(promptCalls.length).toBe(1)
  })

  it('invalidatePromptCache forces refetch', async () => {
    const { mock } = mockSupabase({
      ccp_prompt_versions: { data: sampleVersion, error: null },
    })

    await resolveActivePrompt(PERSONALITY_ID, mock)
    invalidatePromptCache()
    await resolveActivePrompt(PERSONALITY_ID, mock)

    const fromCalls = (mock as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.calls
    const promptCalls = fromCalls.filter((c: string[]) => c[0] === 'ccp_prompt_versions')
    expect(promptCalls.length).toBe(2)
  })
})

describe('registerPromptVersion', () => {
  it('creates a new version with auto-incremented number', async () => {
    const newVersion = { ...sampleVersion, id: 'v-002', version: 2, is_active: false }
    const { mock } = mockSupabase({
      ccp_prompt_versions: { data: newVersion, error: null },
    })

    const result = await registerPromptVersion(PERSONALITY_ID, 'Neuer Prompt.', mock)
    expect(result.version).toBe(2)
    expect(result.personalityId).toBe(PERSONALITY_ID)
  })

  it('starts at version 1 when no existing versions', async () => {
    const newVersion = { ...sampleVersion, id: 'v-001', version: 1, is_active: false }
    const { mock } = mockSupabase({
      ccp_prompt_versions: { data: newVersion, error: null },
    })

    const result = await registerPromptVersion(PERSONALITY_ID, 'Erster Prompt.', mock)
    expect(result.version).toBe(1)
  })

  it('throws on insert failure', async () => {
    const { mock } = mockSupabase({
      ccp_prompt_versions: { data: null, error: { message: 'unique constraint violation' } },
    })

    await expect(registerPromptVersion(PERSONALITY_ID, 'Prompt.', mock))
      .rejects.toThrow('Failed to register prompt version')
  })
})

describe('activatePromptVersion', () => {
  it('deactivates previous and activates target', async () => {
    const target = { ...sampleVersion, id: 'v-002', version: 2, is_active: false }
    const activated = { ...target, is_active: true, activated_at: '2026-10-01T12:00:00Z', activated_by: 'admin@mb.com' }

    const { mock } = mockSupabase({
      ccp_prompt_versions: { data: activated, error: null },
      analytics_events: { data: null, error: null },
    })

    const result = await activatePromptVersion('v-002', 'admin@mb.com', mock)
    expect(result.activated.isActive).toBe(true)
    expect(result.activated.activatedBy).toBe('admin@mb.com')
  })

  it('throws when version not found', async () => {
    const { mock } = mockSupabase({
      ccp_prompt_versions: { data: null, error: null },
    })

    await expect(activatePromptVersion('nonexistent', 'admin@mb.com', mock))
      .rejects.toThrow('Prompt version not found')
  })

  it('invalidates cache after activation', async () => {
    const target = { ...sampleVersion, id: 'v-002', version: 2 }
    const activated = { ...target, is_active: true, activated_by: 'admin@mb.com' }

    const { mock } = mockSupabase({
      ccp_prompt_versions: { data: activated, error: null },
      analytics_events: { data: null, error: null },
    })

    await resolveActivePrompt(PERSONALITY_ID, mock)
    await activatePromptVersion('v-002', 'admin@mb.com', mock)
    await resolveActivePrompt(PERSONALITY_ID, mock)

    const fromCalls = (mock as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.calls
    const promptCalls = fromCalls.filter((c: string[]) => c[0] === 'ccp_prompt_versions')
    expect(promptCalls.length).toBeGreaterThanOrEqual(3)
  })
})

describe('rollbackPromptVersion', () => {
  function mockRollbackSupabase(configs: unknown[], rolledBackRow: unknown) {
    let callCount = 0
    const chain: Record<string, unknown> = {}
    const methods = [
      'select', 'insert', 'update', 'delete',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is',
      'order', 'limit', 'or',
    ]
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
    chain.from = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: rolledBackRow, error: null })
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    chain.then = (resolve: (v: unknown) => void) => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ data: configs, error: null }).then(resolve)
      }
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    return chain as unknown as Parameters<typeof rollbackPromptVersion>[2]
  }

  it('rolls back to the previous version', async () => {
    const current = { ...sampleVersion, id: 'v-002', version: 2, is_active: true }
    const prev = { ...sampleVersion, id: 'v-001', version: 1, is_active: false }
    const rolledBack = { ...prev, is_active: true, activated_at: '2026-10-01T12:00:00Z', activated_by: 'admin@mb.com' }

    const mock = mockRollbackSupabase([current, prev], rolledBack)
    const result = await rollbackPromptVersion(PERSONALITY_ID, 'admin@mb.com', mock)
    expect(result.isActive).toBe(true)
    expect(result.version).toBe(1)
  })

  it('throws when no previous version exists', async () => {
    const mock = mockRollbackSupabase([], null)
    await expect(rollbackPromptVersion(PERSONALITY_ID, 'admin@mb.com', mock))
      .rejects.toThrow('No previous prompt version to rollback to')
  })
})

describe('listPromptVersions', () => {
  it('returns versions sorted desc by version number', async () => {
    const versions = [
      { ...sampleVersion, id: 'v-002', version: 2, is_active: true },
      { ...sampleVersion, id: 'v-001', version: 1, is_active: false },
    ]

    const chainObj: Record<string, unknown> = {}
    const methods = ['select', 'eq', 'order']
    for (const m of methods) chainObj[m] = vi.fn().mockReturnValue(chainObj)
    chainObj.from = vi.fn().mockReturnValue(chainObj)
    chainObj.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: versions, error: null }).then(resolve)

    const mock = chainObj as unknown as Parameters<typeof listPromptVersions>[1]
    const result = await listPromptVersions(PERSONALITY_ID, mock)
    expect(result).toHaveLength(2)
    expect(result[0].version).toBe(2)
    expect(result[1].version).toBe(1)
  })

  it('returns empty array when no versions exist', async () => {
    const chainObj: Record<string, unknown> = {}
    const methods = ['select', 'eq', 'order']
    for (const m of methods) chainObj[m] = vi.fn().mockReturnValue(chainObj)
    chainObj.from = vi.fn().mockReturnValue(chainObj)
    chainObj.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve)

    const mock = chainObj as unknown as Parameters<typeof listPromptVersions>[1]
    const result = await listPromptVersions(PERSONALITY_ID, mock)
    expect(result).toHaveLength(0)
  })
})

describe('prompt_version_switch event (AC-5)', () => {
  it('activation logs prompt_version_switch event', async () => {
    const target = { ...sampleVersion, id: 'v-002', version: 2 }
    const activated = { ...target, is_active: true, activated_by: 'admin@mb.com' }

    const { mock, insertedRows } = mockSupabase({
      ccp_prompt_versions: { data: activated, error: null },
      analytics_events: { data: null, error: null },
    })

    await activatePromptVersion('v-002', 'admin@mb.com', mock)

    await new Promise(r => setTimeout(r, 50))

    const fromCalls = (mock as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.calls
    const eventCalls = fromCalls.filter((c: string[]) => c[0] === 'analytics_events')
    expect(eventCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('rollback logs prompt_version_switch event', async () => {
    const current = { ...sampleVersion, id: 'v-002', version: 2, is_active: true }
    const prev = { ...sampleVersion, id: 'v-001', version: 1, is_active: false }
    const rolledBack = { ...prev, is_active: true, activated_by: 'admin@mb.com' }

    let callCount = 0
    const chain: Record<string, unknown> = {}
    const methods = [
      'select', 'insert', 'update', 'delete',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is',
      'order', 'limit', 'or',
    ]
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
    chain.from = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: rolledBack, error: null })
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    chain.then = (resolve: (v: unknown) => void) => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ data: [current, prev], error: null }).then(resolve)
      }
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    const mock = chain as unknown as Parameters<typeof rollbackPromptVersion>[2]

    await rollbackPromptVersion(PERSONALITY_ID, 'admin@mb.com', mock)

    await new Promise(r => setTimeout(r, 50))

    const fromCalls = (mock as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.calls
    const eventCalls = fromCalls.filter((c: string[]) => c[0] === 'analytics_events')
    expect(eventCalls.length).toBeGreaterThanOrEqual(1)
  })
})

describe('mapRow correctness', () => {
  it('maps snake_case DB row to camelCase interface', async () => {
    const { mock } = mockSupabase({
      ccp_prompt_versions: { data: sampleVersion, error: null },
    })

    const result = await resolveActivePrompt(PERSONALITY_ID, mock)
    expect(result).toMatchObject({
      id: 'v-001',
      personalityId: PERSONALITY_ID,
      version: 1,
      staticPrompt: 'Du bist der Mercedes-Benz Assistent.',
      isActive: true,
      activatedBy: 'migration-033',
    })
  })
})

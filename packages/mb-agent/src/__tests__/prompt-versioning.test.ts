import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveActivePrompt,
  registerPromptVersion,
  activatePromptVersion,
  rollbackPromptVersion,
  listPromptVersions,
  invalidatePromptCache,
} from '../prompt-versioning.js'

function mockSupabase(
  tableResponses: Record<string, { data: unknown; error: unknown }> = {},
  rpcResponses: Record<string, { data: unknown; error: unknown }> = {},
) {
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

  const rpcChain: Record<string, unknown> = {}
  let lastRpcName = ''
  for (const m of methods) rpcChain[m] = vi.fn().mockReturnValue(rpcChain)
  rpcChain.single = vi.fn().mockImplementation(() => {
    return Promise.resolve(rpcResponses[lastRpcName] ?? { data: null, error: null })
  })

  chain.rpc = vi.fn().mockImplementation((name: string) => {
    lastRpcName = name
    return rpcChain
  })

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
  it('deactivates previous and activates target via RPC', async () => {
    const activated = { ...sampleVersion, id: 'v-002', version: 2, is_active: true, activated_at: '2026-10-01T12:00:00Z', activated_by: 'admin@mb.com' }

    const { mock } = mockSupabase(
      {
        ccp_prompt_versions: { data: activated, error: null },
        analytics_events: { data: null, error: null },
      },
      {
        activate_prompt_version: {
          data: { previous_id: 'v-001', activated_id: 'v-002', activated_version: 2 },
          error: null,
        },
      },
    )

    const result = await activatePromptVersion('v-002', 'admin@mb.com', mock)
    expect(result.activated.isActive).toBe(true)
    expect(result.activated.activatedBy).toBe('admin@mb.com')
  })

  it('throws when RPC fails', async () => {
    const { mock } = mockSupabase(
      {},
      {
        activate_prompt_version: {
          data: null,
          error: { message: 'Prompt version not found: nonexistent' },
        },
      },
    )

    await expect(activatePromptVersion('nonexistent', 'admin@mb.com', mock))
      .rejects.toThrow('Failed to activate')
  })

  it('invalidates cache after activation', async () => {
    const activated = { ...sampleVersion, id: 'v-002', version: 2, is_active: true, activated_by: 'admin@mb.com' }

    const { mock } = mockSupabase(
      {
        ccp_prompt_versions: { data: activated, error: null },
        analytics_events: { data: null, error: null },
      },
      {
        activate_prompt_version: {
          data: { previous_id: 'v-001', activated_id: 'v-002', activated_version: 2 },
          error: null,
        },
      },
    )

    await resolveActivePrompt(PERSONALITY_ID, mock)
    await activatePromptVersion('v-002', 'admin@mb.com', mock)
    await resolveActivePrompt(PERSONALITY_ID, mock)

    const fromCalls = (mock as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.calls
    const promptCalls = fromCalls.filter((c: string[]) => c[0] === 'ccp_prompt_versions')
    expect(promptCalls.length).toBeGreaterThanOrEqual(3)
  })
})

describe('rollbackPromptVersion', () => {
  it('rolls back to the previous version via RPC', async () => {
    const rolledBack = { ...sampleVersion, id: 'v-001', version: 1, is_active: true, activated_at: '2026-10-01T12:00:00Z', activated_by: 'admin@mb.com' }

    const { mock } = mockSupabase(
      {
        ccp_prompt_versions: { data: rolledBack, error: null },
        analytics_events: { data: null, error: null },
      },
      {
        rollback_prompt_version: {
          data: { previous_id: 'v-002', rolled_back_to_id: 'v-001', rolled_back_to_version: 1 },
          error: null,
        },
      },
    )

    const result = await rollbackPromptVersion(PERSONALITY_ID, 'admin@mb.com', mock)
    expect(result.isActive).toBe(true)
    expect(result.version).toBe(1)
  })

  it('throws when RPC reports no previous version', async () => {
    const { mock } = mockSupabase(
      {},
      {
        rollback_prompt_version: {
          data: null,
          error: { message: 'No previous prompt version to rollback to' },
        },
      },
    )

    await expect(rollbackPromptVersion(PERSONALITY_ID, 'admin@mb.com', mock))
      .rejects.toThrow('Failed to rollback')
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
    const activated = { ...sampleVersion, id: 'v-002', version: 2, is_active: true, activated_by: 'admin@mb.com' }

    const { mock } = mockSupabase(
      {
        ccp_prompt_versions: { data: activated, error: null },
        analytics_events: { data: null, error: null },
      },
      {
        activate_prompt_version: {
          data: { previous_id: 'v-001', activated_id: 'v-002', activated_version: 2 },
          error: null,
        },
      },
    )

    await activatePromptVersion('v-002', 'admin@mb.com', mock)

    await new Promise(r => setTimeout(r, 50))

    const fromCalls = (mock as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.calls
    const eventCalls = fromCalls.filter((c: string[]) => c[0] === 'analytics_events')
    expect(eventCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('rollback logs prompt_version_switch event', async () => {
    const rolledBack = { ...sampleVersion, id: 'v-001', version: 1, is_active: true, activated_by: 'admin@mb.com' }

    const { mock } = mockSupabase(
      {
        ccp_prompt_versions: { data: rolledBack, error: null },
        analytics_events: { data: null, error: null },
      },
      {
        rollback_prompt_version: {
          data: { previous_id: 'v-002', rolled_back_to_id: 'v-001', rolled_back_to_version: 1 },
          error: null,
        },
      },
    )

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

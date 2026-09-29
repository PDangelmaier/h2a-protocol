import { vi } from 'vitest'

type QueryResult = { data: unknown; error: unknown; count?: number }
type ChainableQuery = Record<string, (...args: unknown[]) => ChainableQuery> & Promise<QueryResult>

export function createMockSupabase(tables: Record<string, QueryResult> = {}) {
  const defaultResult: QueryResult = { data: null, error: null }

  function buildChain(tableName: string): ChainableQuery {
    const stored = tables[tableName] ?? defaultResult

    const chain: Record<string, unknown> = {}
    const methods = [
      'select', 'insert', 'update', 'delete',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is',
      'order', 'limit', 'single', 'maybeSingle',
      'head',
    ]

    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }

    chain.single = vi.fn().mockResolvedValue(stored)
    chain.maybeSingle = vi.fn().mockResolvedValue(stored)
    chain.then = (_resolve: (v: QueryResult) => void) => Promise.resolve(stored).then(_resolve)

    return chain as unknown as ChainableQuery
  }

  const mock = {
    from: vi.fn((table: string) => buildChain(table)),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }

  return mock
}

export function mockSupabaseFrom(
  mock: ReturnType<typeof createMockSupabase>,
  overrides: Record<string, QueryResult>,
) {
  mock.from.mockImplementation((table: string) => {
    const result = overrides[table] ?? { data: null, error: null }

    const chain: Record<string, unknown> = {}
    const methods = [
      'select', 'insert', 'update', 'delete',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is',
      'order', 'limit', 'single', 'maybeSingle',
      'head',
    ]

    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }

    chain.single = vi.fn().mockResolvedValue(result)
    chain.maybeSingle = vi.fn().mockResolvedValue(result)
    chain.then = (_resolve: (v: QueryResult) => void) => Promise.resolve(result).then(_resolve)

    return chain
  })
}

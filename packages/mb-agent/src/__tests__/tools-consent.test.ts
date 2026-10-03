import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { executeToolWithConsent, getAvailableTools, setToolExecutor } from '../tools.js'

setToolExecutor(async () => ({ status: 'dispatched' }))
afterAll(() => setToolExecutor(null))

function makeMockSupabase(toolRow: Record<string, unknown> | null = null) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'lte', 'in', 'is', 'order', 'limit', 'single', 'maybeSingle']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data: toolRow, error: toolRow ? null : { message: 'Not found' } })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: toolRow, error: null })
  const fromMock = vi.fn().mockReturnValue(chain)
  return { from: fromMock, _chain: chain }
}

describe('AC-2: tools — Consent characterization (INV-13)', () => {
  it('tool with requires_consent: without consent → error result', async () => {
    const mock = makeMockSupabase({
      id: 'tool-1',
      tool_name: 'financial_calculator',
      requires_consent: ['financial_data'],
      is_active: true,
    })

    const result = await executeToolWithConsent(
      { toolName: 'tool-1', input: { amount: 1000 } },
      'prof-1',
      [],
      mock as never,
    )

    expect(result.error).toBe(true)
    expect(result.data.message).toContain('Einwilligung')
    expect(result.data.message).toContain('financial_data')
  })

  it('tool with requires_consent: with matching consent → executed', async () => {
    const mock = makeMockSupabase({
      id: 'tool-2',
      tool_name: 'vehicle_catalog',
      requires_consent: ['ai_personalization'],
      is_active: true,
      endpoint_url: '/mock-catalog',
    })

    const result = await executeToolWithConsent(
      { toolName: 'tool-2', input: { query: 'EQS' } },
      'prof-1',
      ['ai_personalization'],
      mock as never,
    )

    expect(result.error).toBe(false)
    expect(result.data.status).toBe('dispatched')
  })

  it('tool without consent requirement → always executed', async () => {
    const mock = makeMockSupabase({
      id: 'tool-3',
      tool_name: 'faq_search',
      requires_consent: [],
      is_active: true,
      endpoint_url: '/mock-faq',
    })

    const result = await executeToolWithConsent(
      { toolName: 'tool-3', input: { q: 'Garantie' } },
      'prof-1',
      [],
      mock as never,
    )

    expect(result.error).toBe(false)
    expect(result.data.status).toBe('dispatched')
  })

  it('unknown tool → error result', async () => {
    const mock = makeMockSupabase(null)

    const result = await executeToolWithConsent(
      { toolName: 'nonexistent', input: {} },
      'prof-1',
      ['ai_personalization'],
      mock as never,
    )

    expect(result.error).toBe(true)
    expect(result.data._h2a_tool_error).toBe(true)
    expect(result.data.errorType).toBe('not_found')
  })

  it('multiple required consents: partial match → error with missing listed', async () => {
    const mock = makeMockSupabase({
      id: 'tool-4',
      tool_name: 'personalization_engine',
      requires_consent: ['ai_personalization', 'marketing_profiling'],
      is_active: true,
    })

    const result = await executeToolWithConsent(
      { toolName: 'tool-4', input: {} },
      'prof-1',
      ['ai_personalization'],
      mock as never,
    )

    expect(result.error).toBe(true)
    expect(result.data.message).toContain('marketing_profiling')
    expect(result.data.message).not.toContain('ai_personalization')
  })
})

describe('AC-2: getAvailableTools — PID/channel filtering', () => {
  it('filters tools by pidScore threshold', async () => {
    const chain: Record<string, unknown> = {}
    const methods = ['select', 'eq', 'lte', 'order', 'limit']
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
    chain.then = (_resolve: (v: unknown) => void) => Promise.resolve({
      data: [
        { id: 't1', tool_name: 'basic', display_name: 'Basic', description: 'd', endpoint_type: 'rest', endpoint_url: '/', input_schema: {}, min_pid_score: 0, requires_consent: [], allowed_channels: ['*'], is_active: true },
        { id: 't2', tool_name: 'premium', display_name: 'Premium', description: 'd', endpoint_type: 'rest', endpoint_url: '/', input_schema: {}, min_pid_score: 80, requires_consent: [], allowed_channels: ['*'], is_active: true },
      ],
      error: null,
    }).then(_resolve)

    const mock = { from: vi.fn().mockReturnValue(chain) }

    const tools = await getAvailableTools(
      { profileId: 'p1', pidScore: 30, locale: 'de', journeyPhase: 'research', intentScore: 0, proactivityLevel: 'ready', vehicles: [] },
      mock as never,
    )

    expect(tools.length).toBeGreaterThanOrEqual(1)
  })
})

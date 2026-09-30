import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadGrantedConsents, clearConsentCache, buildConsentHint, logConsentDenial } from '../consent.js'
import { executeToolWithConsent } from '../tools.js'

function makeMockSupabase(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'lte', 'gte', 'in', 'is', 'order', 'limit', 'single', 'maybeSingle']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)

  let resolveData = overrides.data ?? []
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: resolveData, error: null }).then(resolve)
  chain.single = vi.fn().mockResolvedValue({ data: overrides.singleData ?? null, error: null })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (overrides[table]) {
      const tableChain: Record<string, unknown> = {}
      for (const m of methods) tableChain[m] = vi.fn().mockReturnValue(tableChain)
      const tableData = overrides[table]
      tableChain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: Array.isArray(tableData) ? tableData : [], error: null }).then(resolve)
      tableChain.single = vi.fn().mockResolvedValue({
        data: Array.isArray(tableData) ? tableData[0] : tableData,
        error: null,
      })
      return tableChain
    }
    return chain
  })

  return { from: fromMock, _chain: chain }
}

describe('SPEC-032 AC-1: echte Consents aus consent_records', () => {
  beforeEach(() => clearConsentCache())

  it('loads granted, non-revoked consents for a profile', async () => {
    const mock = makeMockSupabase({
      consent_records: [
        { consent_type: 'ai_personalization', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, created_at: '2026-01-01T00:00:00Z' },
        { consent_type: 'vehicle_data', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, created_at: '2026-01-01T00:00:00Z' },
      ],
    })

    const consents = await loadGrantedConsents('prof-1', mock as never)
    expect(consents).toContain('ai_personalization')
    expect(consents).toContain('vehicle_data')
    expect(consents).toHaveLength(2)
  })

  it('returns empty array for null profileId (anonymous)', async () => {
    const mock = makeMockSupabase()
    const consents = await loadGrantedConsents(null, mock as never)
    expect(consents).toEqual([])
  })

  it('returns empty array for profile with no consents', async () => {
    const mock = makeMockSupabase({ consent_records: [] })
    const consents = await loadGrantedConsents('prof-no-consent', mock as never)
    expect(consents).toEqual([])
  })
})

describe('SPEC-032 AC-2: fehlender Consent → Hinweis in Kundensprache', () => {
  beforeEach(() => clearConsentCache())

  it('returns German hint when locale is de', () => {
    const hint = buildConsentHint(['vehicle_control', 'location_services'], 'de-DE')
    expect(hint).toContain('Fahrzeugsteuerung')
    expect(hint).toContain('Standortdienste')
    expect(hint).toContain('Einwilligung')
    expect(hint).toContain('Datenschutzeinstellungen')
  })

  it('returns English hint for en locale', () => {
    const hint = buildConsentHint(['vehicle_control'], 'en-US')
    expect(hint).toContain('vehicle control')
    expect(hint).toContain('consent')
    expect(hint).toContain('privacy settings')
  })

  it('executeToolWithConsent returns hint with missingConsents', async () => {
    const mock = makeMockSupabase({
      agent_tools: { id: 't-1', tool_name: 'vehicle.remote_control', requires_consent: ['vehicle_control'], is_active: true },
    })

    const result = await executeToolWithConsent(
      { toolId: 't-1', input: {} },
      'prof-1',
      [],
      mock as never,
      'de',
    )

    expect(result.error).toBe(true)
    expect(result.data.missingConsents).toEqual(['vehicle_control'])
    expect(result.data.message).toContain('Fahrzeugsteuerung')
  })
})

describe('SPEC-032 AC-3: widerrufener oder abgelaufener Consent zählt als fehlend', () => {
  beforeEach(() => clearConsentCache())

  it('excludes consents with retention_days expired', async () => {
    const pastDate = new Date(Date.now() - 100 * 86_400_000).toISOString()
    const mock = makeMockSupabase({
      consent_records: [
        { consent_type: 'analytics', granted: true, granted_at: pastDate, revoked_at: null, retention_days: 30, created_at: pastDate },
      ],
    })

    const consents = await loadGrantedConsents('prof-expired', mock as never)
    expect(consents).not.toContain('analytics')
    expect(consents).toEqual([])
  })

  it('includes consents with retention_days not yet expired', async () => {
    const recentDate = new Date(Date.now() - 5 * 86_400_000).toISOString()
    const mock = makeMockSupabase({
      consent_records: [
        { consent_type: 'analytics', granted: true, granted_at: recentDate, revoked_at: null, retention_days: 365, created_at: recentDate },
      ],
    })

    const consents = await loadGrantedConsents('prof-valid', mock as never)
    expect(consents).toContain('analytics')
  })

  it('revoked consent (revoked_at set) is excluded', async () => {
    const mock = makeMockSupabase({
      consent_records: [
        { consent_type: 'analytics', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: '2026-06-01T00:00:00Z', retention_days: null, created_at: '2026-01-01T00:00:00Z' },
      ],
    })
    const consents = await loadGrantedConsents('prof-revoked', mock as never)
    expect(consents).toEqual([])
  })

  it('M1-a: revocation via new row with granted=false supersedes earlier grant', async () => {
    const mock = makeMockSupabase({
      consent_records: [
        { consent_type: 'analytics', granted: false, granted_at: null, revoked_at: null, retention_days: null, created_at: '2026-06-15T00:00:00Z' },
        { consent_type: 'analytics', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, created_at: '2026-01-01T00:00:00Z' },
      ],
    })
    const consents = await loadGrantedConsents('prof-m1a', mock as never)
    expect(consents).not.toContain('analytics')
    expect(consents).toEqual([])
  })

  it('M1-b: re-grant after revocation restores consent', async () => {
    const mock = makeMockSupabase({
      consent_records: [
        { consent_type: 'analytics', granted: true, granted_at: '2026-09-01T00:00:00Z', revoked_at: null, retention_days: null, created_at: '2026-09-01T00:00:00Z' },
        { consent_type: 'analytics', granted: false, granted_at: null, revoked_at: null, retention_days: null, created_at: '2026-06-15T00:00:00Z' },
        { consent_type: 'analytics', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, created_at: '2026-01-01T00:00:00Z' },
      ],
    })
    const consents = await loadGrantedConsents('prof-m1b', mock as never)
    expect(consents).toContain('analytics')
  })
})

describe('SPEC-032 AC-4: Ablehnung wird protokolliert (ohne Nachrichteninhalt)', () => {
  it('logConsentDenial inserts analytics_events with correct shape', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const mock = {
      from: vi.fn().mockReturnValue({
        insert: insertMock,
      }),
    }

    await logConsentDenial({
      profileId: 'prof-1',
      toolId: 't-1',
      toolName: 'vehicle.remote_control',
      requiredConsents: ['vehicle_control'],
      missingConsents: ['vehicle_control'],
      timestamp: '2026-09-30T12:00:00+02:00',
    }, mock as never)

    expect(mock.from).toHaveBeenCalledWith('analytics_events')
    const insertedData = insertMock.mock.calls[0][0]
    expect(insertedData.event_type).toBe('consent_denial')
    expect(insertedData.metadata.tool_name).toBe('vehicle.remote_control')
    expect(insertedData.metadata.missing_consents).toEqual(['vehicle_control'])
    expect(insertedData.metadata).not.toHaveProperty('input')
    expect(insertedData.metadata).not.toHaveProperty('content')
    expect(insertedData.metadata).not.toHaveProperty('message')
  })
})

describe('SPEC-032 AC-5: anonyme Sessions erhalten nur consent-freie Tools', () => {
  beforeEach(() => clearConsentCache())

  it('anonymous (null profileId) gets empty consents', async () => {
    const mock = makeMockSupabase()
    const consents = await loadGrantedConsents(null, mock as never)
    expect(consents).toEqual([])
  })

  it('tool without requires_consent executes for anonymous user', async () => {
    const mock = makeMockSupabase({
      agent_tools: { id: 't-free', tool_name: 'vehicle_catalog', requires_consent: [], is_active: true },
    })

    const result = await executeToolWithConsent(
      { toolId: 't-free', input: {} },
      'anon-prof',
      [],
      mock as never,
    )

    expect(result.error).toBe(false)
  })

  it('tool with requires_consent blocks anonymous user', async () => {
    const mock = makeMockSupabase({
      agent_tools: { id: 't-locked', tool_name: 'configurator', requires_consent: ['ai_personalization'], is_active: true },
    })

    const result = await executeToolWithConsent(
      { toolId: 't-locked', input: {} },
      'anon-prof',
      [],
      mock as never,
    )

    expect(result.error).toBe(true)
    expect(result.data.missingConsents).toEqual(['ai_personalization'])
  })
})

describe('SPEC-032 AC-7: Consent-Cache mit 60s TTL', () => {
  beforeEach(() => clearConsentCache())
  afterEach(() => { vi.useRealTimers() })

  it('M2: cache hit adds ≤30ms overhead (measured)', async () => {
    const fromMock = vi.fn()
    const chain: Record<string, unknown> = {}
    const methods = ['select', 'eq', 'order']
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
    chain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: [{ consent_type: 'marketing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, created_at: '2026-01-01T00:00:00Z' }], error: null }).then(resolve)
    fromMock.mockReturnValue(chain)
    const mock = { from: fromMock }

    await loadGrantedConsents('prof-perf', mock as never)

    const runs = 100
    const start = performance.now()
    for (let i = 0; i < runs; i++) {
      await loadGrantedConsents('prof-perf', mock as never)
    }
    const elapsed = performance.now() - start
    const avgMs = elapsed / runs

    expect(avgMs).toBeLessThan(30)
  })

  it('second call within 60s uses cache (no DB query)', async () => {
    const fromMock = vi.fn()
    const chain: Record<string, unknown> = {}
    const methods = ['select', 'eq', 'order']
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
    chain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: [{ consent_type: 'marketing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, created_at: '2026-01-01T00:00:00Z' }], error: null }).then(resolve)
    fromMock.mockReturnValue(chain)
    const mock = { from: fromMock }

    await loadGrantedConsents('prof-cache', mock as never)
    const callCount = fromMock.mock.calls.filter((c: unknown[]) => c[0] === 'consent_records').length
    expect(callCount).toBe(1)

    await loadGrantedConsents('prof-cache', mock as never)
    const callCount2 = fromMock.mock.calls.filter((c: unknown[]) => c[0] === 'consent_records').length
    expect(callCount2).toBe(1)
  })

  it('cache expires after 60s', async () => {
    vi.useFakeTimers()
    const fromMock = vi.fn()
    const chain: Record<string, unknown> = {}
    const methods = ['select', 'eq', 'order']
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
    chain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: [{ consent_type: 'marketing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, created_at: '2026-01-01T00:00:00Z' }], error: null }).then(resolve)
    fromMock.mockReturnValue(chain)
    const mock = { from: fromMock }

    await loadGrantedConsents('prof-ttl', mock as never)
    vi.advanceTimersByTime(61_000)
    await loadGrantedConsents('prof-ttl', mock as never)

    const callCount = fromMock.mock.calls.filter((c: unknown[]) => c[0] === 'consent_records').length
    expect(callCount).toBe(2)
  })
})

describe('SPEC-032 N3: DB-Fehler wird geloggt, nicht gecacht', () => {
  beforeEach(() => clearConsentCache())

  it('DB error returns [] and logs console.error, does not cache', async () => {
    const fromMock = vi.fn()
    const chain: Record<string, unknown> = {}
    const methods = ['select', 'eq', 'order']
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
    chain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: { message: 'connection refused' } }).then(resolve)
    fromMock.mockReturnValue(chain)
    const mock = { from: fromMock }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const consents = await loadGrantedConsents('prof-err', mock as never)
    expect(consents).toEqual([])
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('connection refused'))

    chain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: [{ consent_type: 'marketing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, created_at: '2026-01-01T00:00:00Z' }], error: null }).then(resolve)

    const consents2 = await loadGrantedConsents('prof-err', mock as never)
    expect(consents2).toContain('marketing')

    spy.mockRestore()
  })
})

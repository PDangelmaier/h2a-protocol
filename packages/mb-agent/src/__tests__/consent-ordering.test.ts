import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadGrantedConsents, isConsentGranted, countGrantedConsents, clearConsentCache } from '../consent.js'

function makeConsentMock(records: Array<Record<string, unknown>>) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'order']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: records, error: null }).then(resolve)
  return { from: vi.fn().mockReturnValue(chain) }
}

describe('SPEC-035 AC-1: seq-basierte Consent-Ordnung', () => {
  beforeEach(() => clearConsentCache())

  it('höchste seq gewinnt bei mehreren Einträgen gleichen Typs', async () => {
    const mock = makeConsentMock([
      { consent_type: 'marketing', granted: false, granted_at: null, revoked_at: null, retention_days: null, seq: 5 },
      { consent_type: 'marketing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, seq: 2 },
    ])
    const consents = await loadGrantedConsents('prof-seq', mock as never)
    expect(consents).not.toContain('marketing')
  })

  it('seq-Ordnung statt created_at: spätere seq überschreibt frühere', async () => {
    const mock = makeConsentMock([
      { consent_type: 'analytics', granted: true, granted_at: '2026-09-01T00:00:00Z', revoked_at: null, retention_days: null, seq: 10 },
      { consent_type: 'analytics', granted: false, granted_at: null, revoked_at: null, retention_days: null, seq: 3 },
    ])
    const consents = await loadGrantedConsents('prof-seq2', mock as never)
    expect(consents).toContain('analytics')
  })
})

describe('SPEC-035 AC-2: isConsentGranted zentrale Funktion', () => {
  beforeEach(() => clearConsentCache())

  it('gibt true wenn Consent aktiv', async () => {
    const mock = makeConsentMock([
      { consent_type: 'proactive_contact', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, seq: 1 },
    ])
    expect(await isConsentGranted('prof-1', 'proactive_contact', mock as never)).toBe(true)
  })

  it('gibt false wenn Consent widerrufen', async () => {
    const mock = makeConsentMock([
      { consent_type: 'proactive_contact', granted: false, granted_at: null, revoked_at: null, retention_days: null, seq: 2 },
      { consent_type: 'proactive_contact', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, seq: 1 },
    ])
    expect(await isConsentGranted('prof-2', 'proactive_contact', mock as never)).toBe(false)
  })

  it('gibt false wenn Consent nicht existiert', async () => {
    const mock = makeConsentMock([])
    expect(await isConsentGranted('prof-3', 'proactive_contact', mock as never)).toBe(false)
  })
})

describe('SPEC-035 AC-2: countGrantedConsents zentrale Funktion', () => {
  beforeEach(() => clearConsentCache())

  it('zählt nur aktive Consents', async () => {
    const mock = makeConsentMock([
      { consent_type: 'marketing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, seq: 3 },
      { consent_type: 'analytics', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, seq: 2 },
      { consent_type: 'proactive_contact', granted: false, granted_at: null, revoked_at: null, retention_days: null, seq: 4 },
      { consent_type: 'proactive_contact', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, seq: 1 },
    ])
    expect(await countGrantedConsents('prof-cnt', mock as never)).toBe(2)
  })

  it('gibt 0 für Profil ohne Consents', async () => {
    const mock = makeConsentMock([])
    expect(await countGrantedConsents('prof-empty', mock as never)).toBe(0)
  })
})

describe('SPEC-035 AC-3: Widerruf-Semantik (4 Fälle)', () => {
  beforeEach(() => clearConsentCache())

  it('Fall 1: Widerruf per revoked_at → Consent ungültig', async () => {
    const mock = makeConsentMock([
      { consent_type: 'marketing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: '2026-06-01T00:00:00Z', retention_days: null, seq: 1 },
    ])
    const consents = await loadGrantedConsents('prof-rev1', mock as never)
    expect(consents).not.toContain('marketing')
  })

  it('Fall 2: Widerruf per granted=false neue Zeile → Consent ungültig', async () => {
    const mock = makeConsentMock([
      { consent_type: 'marketing', granted: false, granted_at: null, revoked_at: null, retention_days: null, seq: 5 },
      { consent_type: 'marketing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, seq: 2 },
    ])
    const consents = await loadGrantedConsents('prof-rev2', mock as never)
    expect(consents).not.toContain('marketing')
  })

  it('Fall 3: Same-Transaction (grant + revoke gleichzeitig) → seq entscheidet', async () => {
    const mock = makeConsentMock([
      { consent_type: 'analytics', granted: false, granted_at: null, revoked_at: null, retention_days: null, seq: 8 },
      { consent_type: 'analytics', granted: true, granted_at: '2026-09-01T00:00:00Z', revoked_at: null, retention_days: null, seq: 7 },
    ])
    const consents = await loadGrantedConsents('prof-rev3', mock as never)
    expect(consents).not.toContain('analytics')
  })

  it('Fall 4: Re-Grant nach Widerruf → Consent wieder gültig', async () => {
    const mock = makeConsentMock([
      { consent_type: 'marketing', granted: true, granted_at: '2026-09-15T00:00:00Z', revoked_at: null, retention_days: null, seq: 10 },
      { consent_type: 'marketing', granted: false, granted_at: null, revoked_at: null, retention_days: null, seq: 5 },
      { consent_type: 'marketing', granted: true, granted_at: '2026-01-01T00:00:00Z', revoked_at: null, retention_days: null, seq: 2 },
    ])
    const consents = await loadGrantedConsents('prof-rev4', mock as never)
    expect(consents).toContain('marketing')
  })
})

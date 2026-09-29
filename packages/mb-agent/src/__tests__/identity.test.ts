import { describe, it, expect, vi } from 'vitest'
import { resolveIdentity, pidScoreToTier } from '../identity.js'

function makeChainable(result: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'is', 'gte', 'order', 'limit']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.then = (_r: (v: unknown) => void) => Promise.resolve(result).then(_r)
  return chain
}

function makeSupabase(scenario: 'mercedes_me' | 'social' | 'phone' | 'anonymous') {
  let profileCallCount = 0

  const mock = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'customer_profiles') {
        profileCallCount++
        if (scenario === 'mercedes_me' && profileCallCount === 1) {
          return makeChainable({ data: { id: 'prof-mm' }, error: null })
        }
        if (scenario === 'anonymous' && profileCallCount === 1) {
          return makeChainable({ data: { id: 'prof-anon' }, error: null })
        }
        if (scenario === 'anonymous' && profileCallCount >= 2) {
          return makeChainable({ data: { mercedes_me_id: null, email: null, phone: null, total_sessions: 0, last_active_at: null }, error: null })
        }
        if (scenario === 'social') {
          return makeChainable({ data: { id: 'prof-social', mercedes_me_id: null, email: null, phone: null, total_sessions: 0, last_active_at: null }, error: null })
        }
        return makeChainable({ data: { id: 'prof-mm', mercedes_me_id: 'me-1', email: 'max@mb.com', phone: '+49123', total_sessions: 12, last_active_at: new Date().toISOString() }, error: null })
      }
      if (table === 'identity_links') {
        if (scenario === 'social') {
          return makeChainable({ data: { profile_id: 'prof-social' }, error: null })
        }
        return makeChainable({ data: [], error: null })
      }
      if (table === 'consent_records') {
        const cnt = scenario === 'anonymous' ? 0 : 2
        return makeChainable({ data: null, error: null, count: cnt })
      }
      return makeChainable({ data: null, error: null })
    }),
  }

  return mock
}

describe('AC-5: identity — resolveIdentity characterization', () => {
  it('resolves known MercedesMe user → isReturning=true', async () => {
    const mock = makeSupabase('mercedes_me')
    const result = await resolveIdentity('web', { mercedesMeId: 'me-1' }, mock as never)
    expect(result.profileId).toBe('prof-mm')
    expect(result.isReturning).toBe(true)
  })

  it('resolves unknown user → creates anonymous profile', async () => {
    const mock = makeSupabase('anonymous')
    const result = await resolveIdentity('web', {}, mock as never)
    expect(result.isReturning).toBe(false)
    expect(result.identityTier).toBe('anonymous')
    expect(result.pidScore).toBe(0)
  })

  it('resolves linked social user → uses existing profile', async () => {
    const mock = makeSupabase('social')
    const result = await resolveIdentity('web', { socialToken: 'google-abc' }, mock as never)
    expect(result.profileId).toBe('prof-social')
    expect(result.mergedThisSession).toBe(true)
  })

  it('pidScoreToTier boundary: 19 → anonymous, 20 → recognized', () => {
    expect(pidScoreToTier(19)).toBe('anonymous')
    expect(pidScoreToTier(20)).toBe('recognized')
  })

  it('pidScoreToTier boundary: 39 → recognized, 40 → soft_login', () => {
    expect(pidScoreToTier(39)).toBe('recognized')
    expect(pidScoreToTier(40)).toBe('soft_login')
  })

  it('pidScoreToTier boundary: 59 → soft_login, 60 → identified', () => {
    expect(pidScoreToTier(59)).toBe('soft_login')
    expect(pidScoreToTier(60)).toBe('identified')
  })

  it('pidScoreToTier boundary: 79 → identified, 80 → premium', () => {
    expect(pidScoreToTier(79)).toBe('identified')
    expect(pidScoreToTier(80)).toBe('premium')
  })
})

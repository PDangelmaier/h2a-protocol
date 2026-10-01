import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('../identity.js', () => ({
  resolveIdentity: vi.fn().mockResolvedValue({
    profileId: 'prof-1', pidScore: 55, identityTier: 'soft_login',
    isReturning: false, vehicles: [], mergedThisSession: false,
  }),
}))

import { createClient } from '@supabase/supabase-js'
import { createSession, pauseSession, resumeSession, endSession, transferSession } from '../session.js'

function makeChain(singleResult: unknown = null, errorVal: unknown = null) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'order', 'limit', 'single', 'maybeSingle', 'in', 'is']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data: singleResult, error: errorVal })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: singleResult, error: errorVal })
  return chain
}

describe('AC-3: session — lifecycle characterization', () => {
  const config = {
    supabaseUrl: 'http://localhost:54321',
    supabaseServiceKey: 'test-key',
    nexus: { endpoint: 'http://nexus', bearerToken: 'tok' },
    market: 'DE',
    defaultLocale: 'de-DE',
  }

  describe('createSession', () => {
    it('creates session with status active and returns profileId', async () => {
      const chain = makeChain({ id: 'sess-db-1' })
      vi.mocked(createClient).mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as never)

      const result = await createSession(
        { type: 'session.open' },
        'web',
        { mercedesMeId: 'me-123' },
        config,
      )

      expect(result.status).toBe('active')
      expect(result.profileId).toBe('prof-1')
      expect(result.channel).toBe('web')
    })

    it('throws on DB error', async () => {
      const chain = makeChain(null, { message: 'insert failed' })
      vi.mocked(createClient).mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as never)

      await expect(createSession(
        { type: 'session.open' },
        'web',
        {},
        config,
      )).rejects.toThrow('Session creation failed')
    })
  })

  describe('pauseSession', () => {
    it('updates status to paused', async () => {
      const chain = makeChain()
      chain.update = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      ;(chain as Record<string, unknown>).then = (_r: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(_r)
      const mock = { from: vi.fn().mockReturnValue(chain) }

      await expect(pauseSession('sess-1', 'User left', mock as never)).resolves.not.toThrow()
    })
  })

  describe('resumeSession', () => {
    it('resumes paused session on new channel', async () => {
      let callCount = 0
      const mock = {
        from: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return makeChain({ id: 'sess-1', channel: 'web', intent_score: 30 })
          }
          if (callCount === 2) {
            return makeChain({ pid_score: 60, identity_tier: 'identified' })
          }
          const chain = makeChain()
          chain.update = vi.fn().mockReturnValue(chain)
          chain.eq = vi.fn().mockReturnValue(chain)
          ;(chain as Record<string, unknown>).then = (_r: (v: unknown) => void) =>
            Promise.resolve({ data: null, error: null }).then(_r)
          return chain
        }),
      }

      const result = await resumeSession('prof-1', 'app', mock as never)
      expect(result.status).toBe('active')
      expect(result.channel).toBe('app')
    })

    it('throws if no paused session found', async () => {
      const mock = { from: vi.fn().mockReturnValue(makeChain(null)) }

      await expect(resumeSession('prof-1', 'web', mock as never)).rejects.toThrow('No paused session found')
    })
  })

  describe('endSession', () => {
    it('sets status to ended', async () => {
      const chain = makeChain()
      chain.update = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      ;(chain as Record<string, unknown>).then = (_r: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(_r)
      const mock = { from: vi.fn().mockReturnValue(chain) }

      await expect(endSession('sess-1', mock as never)).resolves.not.toThrow()
    })
  })

  describe('transferSession', () => {
    it('transfers to human agent', async () => {
      const chain = makeChain()
      chain.update = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      ;(chain as Record<string, unknown>).then = (_r: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(_r)
      const mock = { from: vi.fn().mockReturnValue(chain) }

      await expect(
        transferSession('sess-1', { type: 'human', id: 'agent-007' }, mock as never),
      ).resolves.not.toThrow()
    })
  })
})

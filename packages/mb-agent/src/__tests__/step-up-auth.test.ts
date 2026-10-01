import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkStepUp, loadSessionAuthState, logStepUpEvent, getDefaultFreshnessMinutes } from '../step-up-auth.js'
import type { SessionAuthState, StepUpCheckResult } from '../step-up-auth.js'

function freshAuthState(overrides?: Partial<SessionAuthState>): SessionAuthState {
  return {
    authTier: 'identified',
    lastAuthAt: new Date().toISOString(),
    deviceFingerprint: 'fp-abc123',
    ...overrides,
  }
}

function expiredAuthState(): SessionAuthState {
  const expired = new Date(Date.now() - 20 * 60_000).toISOString()
  return { authTier: 'identified', lastAuthAt: expired, deviceFingerprint: 'fp-abc123' }
}

describe('step-up-auth', () => {
  describe('AC-1: high-risk tools require identified tier + fresh auth', () => {
    it('allows high-risk tool with identified tier and fresh auth', () => {
      const result = checkStepUp('high', freshAuthState(), 'fp-abc123')
      expect(result.allowed).toBe(true)
    })

    it('allows high-risk tool with premium tier and fresh auth', () => {
      const result = checkStepUp('high', freshAuthState({ authTier: 'premium' }), 'fp-abc123')
      expect(result.allowed).toBe(true)
    })

    it('blocks high-risk tool with anonymous tier', () => {
      const result = checkStepUp('high', freshAuthState({ authTier: 'anonymous' }), 'fp-abc123')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('tier_insufficient')
    })

    it('blocks high-risk tool with recognized tier', () => {
      const result = checkStepUp('high', freshAuthState({ authTier: 'recognized' }), 'fp-abc123')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('tier_insufficient')
    })

    it('blocks high-risk tool with soft_login tier', () => {
      const result = checkStepUp('high', freshAuthState({ authTier: 'soft_login' }), 'fp-abc123')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('tier_insufficient')
    })

    it('blocks high-risk tool with expired auth (>15 min)', () => {
      const result = checkStepUp('high', expiredAuthState(), 'fp-abc123')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('auth_expired')
    })

    it('blocks high-risk tool when last_auth_at is null', () => {
      const result = checkStepUp('high', freshAuthState({ lastAuthAt: null }), 'fp-abc123')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('auth_expired')
    })

    it('uses configurable freshness threshold', () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString()
      const state = freshAuthState({ lastAuthAt: tenMinAgo })

      expect(checkStepUp('high', state, 'fp-abc123', 5).allowed).toBe(false)
      expect(checkStepUp('high', state, 'fp-abc123', 15).allowed).toBe(true)
    })

    it('defaults to 15 minutes freshness', () => {
      expect(getDefaultFreshnessMinutes()).toBe(15)
    })

    it('also applies to critical risk level', () => {
      const result = checkStepUp('critical', freshAuthState({ authTier: 'anonymous' }), 'fp-abc123')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('tier_insufficient')
    })
  })

  describe('AC-2: step_up_required error + SSE event format', () => {
    it('returns requiredTier in check result', () => {
      const result = checkStepUp('high', freshAuthState({ authTier: 'anonymous' }), null)
      expect(result.requiredTier).toBe('identified')
    })

    it('returns reason in check result', () => {
      const result = checkStepUp('high', expiredAuthState(), 'fp-abc123')
      expect(result.reason).toBe('auth_expired')
    })
  })

  describe('AC-3: device fingerprint change locks high-risk tools', () => {
    it('blocks when fingerprint changes', () => {
      const state = freshAuthState({ deviceFingerprint: 'fp-original' })
      const result = checkStepUp('high', state, 'fp-different')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('device_changed')
    })

    it('allows when fingerprint matches', () => {
      const state = freshAuthState({ deviceFingerprint: 'fp-abc123' })
      const result = checkStepUp('high', state, 'fp-abc123')
      expect(result.allowed).toBe(true)
    })

    it('allows when no stored fingerprint', () => {
      const state = freshAuthState({ deviceFingerprint: null })
      const result = checkStepUp('high', state, 'fp-new')
      expect(result.allowed).toBe(true)
    })

    it('allows when no current fingerprint provided', () => {
      const state = freshAuthState({ deviceFingerprint: 'fp-stored' })
      const result = checkStepUp('high', state, null)
      expect(result.allowed).toBe(true)
    })

    it('device change takes priority over tier check', () => {
      const state = freshAuthState({ authTier: 'identified', deviceFingerprint: 'fp-old' })
      const result = checkStepUp('high', state, 'fp-new')
      expect(result.reason).toBe('device_changed')
    })
  })

  describe('AC-4: events step_up_required/denied without parameter values', () => {
    it('logStepUpEvent inserts event without tool parameters', async () => {
      const insertedRows: unknown[] = []
      const supabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockImplementation((row: unknown) => {
            insertedRows.push(row)
            return { error: null }
          }),
        }),
      } as unknown as Parameters<typeof logStepUpEvent>[4]

      await logStepUpEvent('step_up_required', 'sess-1', 'vehicle.lock', 'auth_expired', supabase)

      expect(insertedRows).toHaveLength(1)
      const row = insertedRows[0] as Record<string, unknown>
      expect(row.event_type).toBe('step_up_required')
      expect(row.session_id).toBe('sess-1')
      const meta = row.metadata as Record<string, unknown>
      expect(meta.tool_name).toBe('vehicle.lock')
      expect(meta.reason).toBe('auth_expired')
      expect(meta).not.toHaveProperty('parameters')
      expect(meta).not.toHaveProperty('input')
    })

    it('logStepUpEvent inserts step_up_denied event', async () => {
      const insertedRows: unknown[] = []
      const supabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockImplementation((row: unknown) => {
            insertedRows.push(row)
            return { error: null }
          }),
        }),
      } as unknown as Parameters<typeof logStepUpEvent>[4]

      await logStepUpEvent('step_up_denied', 'sess-1', 'financing.apply', 'device_changed', supabase)

      const row = insertedRows[0] as Record<string, unknown>
      expect(row.event_type).toBe('step_up_denied')
    })
  })

  describe('AC-5: low/medium unchanged; high blocked/allowed correctly', () => {
    it('low risk tools always allowed regardless of auth state', () => {
      const state = freshAuthState({ authTier: 'anonymous', lastAuthAt: null })
      expect(checkStepUp('normal', state, null).allowed).toBe(true)
    })

    it('medium/elevated risk tools always allowed regardless of auth state', () => {
      const state = freshAuthState({ authTier: 'anonymous', lastAuthAt: null })
      expect(checkStepUp('elevated', state, null).allowed).toBe(true)
    })

    it('high without auth → blocked', () => {
      const state: SessionAuthState = { authTier: 'anonymous', lastAuthAt: null, deviceFingerprint: null }
      expect(checkStepUp('high', state, null).allowed).toBe(false)
    })

    it('high with fresh auth → allowed', () => {
      const result = checkStepUp('high', freshAuthState(), 'fp-abc123')
      expect(result.allowed).toBe(true)
    })

    it('high with expired auth → blocked', () => {
      const result = checkStepUp('high', expiredAuthState(), 'fp-abc123')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('auth_expired')
    })

    it('device change → blocked', () => {
      const state = freshAuthState({ deviceFingerprint: 'fp-old' })
      const result = checkStepUp('high', state, 'fp-new')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('device_changed')
    })
  })

  describe('AC-6: consent-gate checks before step-up; both independently tested', () => {
    it('step-up check is independent of consent — it does not check consents', () => {
      const result = checkStepUp('high', freshAuthState(), 'fp-abc123')
      expect(result.allowed).toBe(true)
    })

    it('step-up failure returns step_up_required not consent_missing', () => {
      const result = checkStepUp('high', freshAuthState({ authTier: 'anonymous' }), null)
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('tier_insufficient')
    })
  })

  describe('loadSessionAuthState', () => {
    it('loads auth state from supabase', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  auth_tier: 'identified',
                  last_auth_at: '2026-10-01T10:00:00+02:00',
                  device_fingerprint: 'fp-xyz',
                },
              }),
            }),
          }),
        }),
      } as unknown as Parameters<typeof loadSessionAuthState>[1]

      const result = await loadSessionAuthState('sess-123', supabase)
      expect(result.authTier).toBe('identified')
      expect(result.lastAuthAt).toBe('2026-10-01T10:00:00+02:00')
      expect(result.deviceFingerprint).toBe('fp-xyz')
    })

    it('defaults to anonymous when session has no auth data', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
      } as unknown as Parameters<typeof loadSessionAuthState>[1]

      const result = await loadSessionAuthState('sess-missing', supabase)
      expect(result.authTier).toBe('anonymous')
      expect(result.lastAuthAt).toBeNull()
      expect(result.deviceFingerprint).toBeNull()
    })
  })
})

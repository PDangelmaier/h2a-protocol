import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getSupabase, createTestSession, cleanupSession, type SessionFixture } from './setup.js'
import { loadGrantedConsents, clearConsentCache, revokeConsent, isConsentGranted } from '../src/consent.js'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('AC-3: Consent revocation + cache immediacy + timestamp ordering', () => {
  let supabase: SupabaseClient
  let fixture: SessionFixture

  beforeAll(async () => {
    supabase = getSupabase()
    fixture = await createTestSession(supabase)
  })

  afterAll(async () => {
    await supabase.from('consent_records').delete().eq('customer_id', fixture.profileId)
    await cleanupSession(supabase, fixture)
  })

  it('revokeConsent clears cache immediately — no stale reads', async () => {
    clearConsentCache()

    await supabase.from('consent_records').insert({
      customer_id: fixture.profileId,
      consent_type: 'analytics',
      granted: true,
      granted_at: new Date().toISOString(),
    })

    const before = await loadGrantedConsents(fixture.profileId, supabase)
    expect(before).toContain('analytics')

    const revoked = await revokeConsent(fixture.profileId, 'analytics' as any, supabase)
    expect(revoked).toBe(true)

    const after = await loadGrantedConsents(fixture.profileId, supabase)
    expect(after).not.toContain('analytics')
  })

  it('isConsentGranted returns false after revocation', async () => {
    clearConsentCache()

    await supabase.from('consent_records').insert({
      customer_id: fixture.profileId,
      consent_type: 'marketing',
      granted: true,
      granted_at: new Date().toISOString(),
    })

    expect(await isConsentGranted(fixture.profileId, 'marketing', supabase)).toBe(true)

    await revokeConsent(fixture.profileId, 'marketing' as any, supabase)

    expect(await isConsentGranted(fixture.profileId, 'marketing', supabase)).toBe(false)
  })

  it('timestamp ordering — later seq wins over earlier', async () => {
    clearConsentCache()

    await supabase.from('consent_records').insert({
      customer_id: fixture.profileId,
      consent_type: 'ai_personalization',
      granted: true,
      granted_at: '2026-01-01T00:00:00Z',
    })

    await supabase.from('consent_records').insert({
      customer_id: fixture.profileId,
      consent_type: 'ai_personalization',
      granted: false,
      granted_at: null,
      revoked_at: null,
    })

    const consents = await loadGrantedConsents(fixture.profileId, supabase)
    expect(consents).not.toContain('ai_personalization')
  })

  it('re-grant after revocation works', async () => {
    clearConsentCache()

    await supabase.from('consent_records').insert({
      customer_id: fixture.profileId,
      consent_type: 'cross_channel',
      granted: true,
      granted_at: new Date().toISOString(),
    })

    await revokeConsent(fixture.profileId, 'cross_channel' as any, supabase)

    await supabase.from('consent_records').insert({
      customer_id: fixture.profileId,
      consent_type: 'cross_channel',
      granted: true,
      granted_at: new Date().toISOString(),
    })

    clearConsentCache()
    const consents = await loadGrantedConsents(fixture.profileId, supabase)
    expect(consents).toContain('cross_channel')
  })
})

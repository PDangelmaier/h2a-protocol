import type { SupabaseClient } from '@supabase/supabase-js'
import type { Channel, ChannelMetadata, IdentityTier, ResolvedIdentity, VehicleRef } from './types.js'

export function pidScoreToTier(score: number): IdentityTier {
  if (score >= 80) return 'premium'
  if (score >= 60) return 'identified'
  if (score >= 40) return 'soft_login'
  if (score >= 20) return 'recognized'
  return 'anonymous'
}

export function computePIDScore(factors: {
  hasMercedesMe: boolean
  hasEmail: boolean
  hasPhone: boolean
  identityLinkCount: number
  vehicleCount: number
  hasConnectedVehicle: boolean
  totalSessions: number
  daysSinceLastActive: number
  consentCount: number
}): number {
  let score = 0

  // Identity factor (max 40)
  if (factors.hasMercedesMe) score += 20
  if (factors.hasEmail) score += 8
  if (factors.hasPhone) score += 5
  score += Math.min(factors.identityLinkCount * 3, 7)

  // Vehicle factor (max 30)
  score += Math.min(factors.vehicleCount * 10, 15)
  if (factors.hasConnectedVehicle) score += 15

  // Interaction factor (max 20)
  score += Math.min(factors.totalSessions, 10)
  if (factors.daysSinceLastActive <= 7) score += 10

  // Consent factor (max 10)
  score += Math.min(factors.consentCount * 2, 10)

  return Math.min(score, 100)
}

async function matchByMercedesMe(mercedesMeId: string, supabase: SupabaseClient) {
  const { data } = await supabase
    .from('customer_profiles')
    .select('id')
    .eq('mercedes_me_id', mercedesMeId)
    .maybeSingle()
  return data
}

async function matchBySocialProvider(externalId: string, supabase: SupabaseClient) {
  const { data } = await supabase
    .from('identity_links')
    .select('profile_id')
    .eq('external_id', externalId)
    .in('provider', ['google', 'apple', 'amazon'])
    .maybeSingle()
  return data?.profile_id ?? null
}

async function matchByPhone(phone: string, supabase: SupabaseClient) {
  const { data } = await supabase
    .from('customer_profiles')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()
  return data?.id ?? null
}

async function createAnonymousProfile(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('customer_profiles')
    .insert({ identity_tier: 'anonymous', pid_score: 0 })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Failed to create profile: ${error?.message}`)
  return data.id
}

export async function resolveIdentity(
  channel: Channel,
  meta: ChannelMetadata,
  supabase: SupabaseClient,
): Promise<ResolvedIdentity> {
  let profileId: string | null = null
  let merged = false

  if (meta.mercedesMeId) {
    const profile = await matchByMercedesMe(meta.mercedesMeId, supabase)
    profileId = profile?.id ?? null
  }

  if (!profileId && meta.socialToken) {
    profileId = await matchBySocialProvider(meta.socialToken, supabase)
    merged = !!profileId
  }

  if (!profileId && meta.phoneNumber) {
    profileId = await matchByPhone(meta.phoneNumber, supabase)
  }

  const isReturning = !!profileId
  if (!profileId) {
    profileId = await createAnonymousProfile(supabase)
  }

  const [profileData, identityLinks, consentCount] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('mercedes_me_id, email, phone, total_sessions, last_active_at')
      .eq('id', profileId)
      .single(),
    supabase
      .from('identity_links')
      .select('id')
      .eq('profile_id', profileId),
    supabase
      .from('consent_records')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', profileId)
      .eq('granted', true)
      .is('revoked_at', null),
  ])

  const p = profileData.data
  const daysSinceActive = p?.last_active_at
    ? (Date.now() - new Date(p.last_active_at).getTime()) / (1000 * 60 * 60 * 24)
    : 999

  const pidScore = computePIDScore({
    hasMercedesMe: !!p?.mercedes_me_id,
    hasEmail: !!p?.email,
    hasPhone: !!p?.phone,
    identityLinkCount: identityLinks.data?.length ?? 0,
    vehicleCount: 0,
    hasConnectedVehicle: false,
    totalSessions: p?.total_sessions ?? 0,
    daysSinceLastActive: daysSinceActive,
    consentCount: consentCount.count ?? 0,
  })

  await supabase
    .from('customer_profiles')
    .update({ pid_score: pidScore, identity_tier: pidScoreToTier(pidScore) })
    .eq('id', profileId)

  return {
    profileId,
    pidScore,
    identityTier: pidScoreToTier(pidScore),
    isReturning,
    vehicles: [],
    mergedThisSession: merged,
  }
}

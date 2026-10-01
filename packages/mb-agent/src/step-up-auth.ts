import type { SupabaseClient } from '@supabase/supabase-js'
import type { IdentityTier } from './types.js'

const DEFAULT_AUTH_FRESHNESS_MINUTES = 15
const REQUIRED_TIER: IdentityTier = 'identified'

const TIER_ORDER: IdentityTier[] = ['anonymous', 'recognized', 'soft_login', 'identified', 'premium']

export type StepUpReason = 'auth_expired' | 'tier_insufficient' | 'device_changed'

export interface StepUpCheckResult {
  allowed: boolean
  reason?: StepUpReason
  requiredTier: IdentityTier
}

export interface SessionAuthState {
  authTier: IdentityTier
  lastAuthAt: string | null
  deviceFingerprint: string | null
}

function tierMeetsMinimum(tier: IdentityTier, minimum: IdentityTier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(minimum)
}

function isAuthFresh(lastAuthAt: string | null, freshnessMinutes: number): boolean {
  if (!lastAuthAt) return false
  const authTime = new Date(lastAuthAt).getTime()
  const cutoff = Date.now() - freshnessMinutes * 60_000
  return authTime >= cutoff
}

export function checkStepUp(
  riskLevel: string,
  authState: SessionAuthState,
  currentFingerprint: string | null,
  freshnessMinutes: number = DEFAULT_AUTH_FRESHNESS_MINUTES,
): StepUpCheckResult {
  if (riskLevel !== 'high' && riskLevel !== 'critical') {
    return { allowed: true, requiredTier: REQUIRED_TIER }
  }

  if (currentFingerprint && authState.deviceFingerprint && currentFingerprint !== authState.deviceFingerprint) {
    return { allowed: false, reason: 'device_changed', requiredTier: REQUIRED_TIER }
  }

  if (!tierMeetsMinimum(authState.authTier, REQUIRED_TIER)) {
    return { allowed: false, reason: 'tier_insufficient', requiredTier: REQUIRED_TIER }
  }

  if (!isAuthFresh(authState.lastAuthAt, freshnessMinutes)) {
    return { allowed: false, reason: 'auth_expired', requiredTier: REQUIRED_TIER }
  }

  return { allowed: true, requiredTier: REQUIRED_TIER }
}

export async function loadSessionAuthState(
  sessionId: string,
  supabase: SupabaseClient,
): Promise<SessionAuthState> {
  const { data } = await supabase
    .from('sessions')
    .select('auth_tier, last_auth_at, device_fingerprint')
    .eq('id', sessionId)
    .single()

  return {
    authTier: (data?.auth_tier as IdentityTier) ?? 'anonymous',
    lastAuthAt: data?.last_auth_at ?? null,
    deviceFingerprint: data?.device_fingerprint ?? null,
  }
}

export async function logStepUpEvent(
  eventType: 'step_up_required' | 'step_up_denied',
  sessionId: string,
  toolName: string,
  reason: StepUpReason,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase.from('analytics_events').insert({
    session_id: sessionId,
    event_type: eventType,
    metadata: { tool_name: toolName, reason },
  })
}

export function getDefaultFreshnessMinutes(): number {
  return DEFAULT_AUTH_FRESHNESS_MINUTES
}

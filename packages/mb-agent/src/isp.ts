import type { SupabaseClient } from '@supabase/supabase-js'
import type { JourneyPhase, ProactivityLevel } from './types.js'
import { isConsentGranted } from './consent.js'

export const INTENT_SIGNAL_WEIGHTS: Record<string, number> = {
  page_view_model: 3,
  page_view_configurator: 8,
  page_view_pricing: 10,
  page_view_dealer: 7,
  page_view_service: 4,
  configurator_started: 12,
  configurator_completed: 18,
  configurator_saved: 15,
  test_drive_requested: 20,
  test_drive_completed: 22,
  offer_requested: 18,
  financing_calculated: 15,
  dealer_contact: 16,
  brochure_download: 6,
  video_watched: 4,
  newsletter_signup: 5,
  mercedes_me_login: 8,
  vehicle_comparison: 7,
  trade_in_valuation: 14,
  service_booked: 10,
  recall_check: 3,
  chat_initiated: 2,
}

const PHASE_MULTIPLIERS: Record<JourneyPhase, number> = {
  awareness: 0.5,
  research: 0.7,
  configuration: 1.0,
  pricing: 1.2,
  purchase: 1.5,
  order: 0.8,
  onboarding: 0.4,
  ownership: 0.3,
  service: 0.6,
  lifecycle: 0.5,
}

interface IntentSignal {
  type: string
  weight?: number
  timestamp: Date
}

export function computeIntentScore(signals: IntentSignal[], currentPhase: JourneyPhase): number {
  const now = Date.now()
  const phaseMultiplier = PHASE_MULTIPLIERS[currentPhase]

  const rawScore = signals.reduce((sum, signal) => {
    const baseWeight = signal.weight ?? INTENT_SIGNAL_WEIGHTS[signal.type] ?? 1
    const daysSince = (now - signal.timestamp.getTime()) / (1000 * 60 * 60 * 24)
    const decay = Math.exp(-0.1 * daysSince)
    return sum + baseWeight * decay
  }, 0)

  const maxPossible = 150
  const normalized = (rawScore * phaseMultiplier / maxPossible) * 100
  return Math.round(Math.min(Math.max(normalized, 0), 100))
}

export function scoreToProactivity(score: number): ProactivityLevel {
  if (score >= 80) return 'engaged'
  if (score >= 60) return 'accompanying'
  if (score >= 40) return 'attentive'
  if (score >= 20) return 'ready'
  return 'still'
}

interface SafetyValveResult {
  allowed: boolean
  reason?: string
}

export async function checkSafetyValves(
  profileId: string,
  currentLevel: ProactivityLevel,
  supabase: SupabaseClient,
): Promise<SafetyValveResult> {
  if (currentLevel === 'still') return { allowed: true }

  const dismissalCheck = await checkDismissals(profileId, supabase)
  if (!dismissalCheck.allowed) return dismissalCheck

  const rateCheck = await checkRateLimit(profileId, supabase)
  if (!rateCheck.allowed) return rateCheck

  const consentCheck = await checkConsent(profileId, currentLevel, supabase)
  if (!consentCheck.allowed) return consentCheck

  return { allowed: true }
}

async function checkDismissals(profileId: string, supabase: SupabaseClient): Promise<SafetyValveResult> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('behavioral_signals')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', profileId)
    .eq('signal_type', 'proactive_dismissed')
    .gte('created_at', cutoff)

  if ((count ?? 0) >= 3) {
    return { allowed: false, reason: 'Zu viele abgewiesene proaktive Nachrichten in 24h' }
  }
  return { allowed: true }
}

async function checkRateLimit(profileId: string, supabase: SupabaseClient): Promise<SafetyValveResult> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('behavioral_signals')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', profileId)
    .eq('signal_type', 'proactive_sent')
    .gte('created_at', cutoff)

  if ((count ?? 0) >= 5) {
    return { allowed: false, reason: 'Rate-Limit: max 5 proaktive Nachrichten pro Stunde' }
  }
  return { allowed: true }
}

async function checkConsent(
  profileId: string,
  level: ProactivityLevel,
  supabase: SupabaseClient,
): Promise<SafetyValveResult> {
  if (level === 'ready' || level === 'still') return { allowed: true }

  try {
    const granted = await isConsentGranted(profileId, 'proactive_contact', supabase)
    if (!granted) {
      return { allowed: false, reason: 'Keine Einwilligung für proaktive Nachrichten' }
    }
    return { allowed: true }
  } catch (err) {
    console.error(`[checkConsent] Error checking proactive_contact for ${profileId}:`, err)
    return { allowed: false, reason: 'Fehler beim Prüfen der Einwilligung' }
  }
}

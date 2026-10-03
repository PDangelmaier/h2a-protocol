import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsentType } from './enterprise-types.js'

interface ConsentCacheEntry {
  consents: ConsentType[]
  fetchedAt: number
}

const CACHE_TTL_MS = 60_000
const consentCache = new Map<string, ConsentCacheEntry>()

export function clearConsentCache(): void {
  consentCache.clear()
}

export async function isConsentGranted(
  profileId: string,
  consentType: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  const granted = await loadGrantedConsents(profileId, supabase)
  return granted.includes(consentType as ConsentType)
}

export async function countGrantedConsents(
  profileId: string,
  supabase: SupabaseClient,
): Promise<number> {
  const granted = await loadGrantedConsents(profileId, supabase)
  return granted.length
}

export async function loadGrantedConsents(
  profileId: string | null,
  supabase: SupabaseClient,
): Promise<ConsentType[]> {
  if (!profileId) return []

  const cached = consentCache.get(profileId)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.consents
  }

  const { data, error } = await supabase
    .from('consent_records')
    .select('consent_type, granted, granted_at, revoked_at, retention_days, seq')
    .eq('customer_id', profileId)
    .order('seq', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error(`[loadGrantedConsents] DB error for ${profileId}: ${error.message}`)
    return []
  }

  const latest = new Map<string, (typeof data)[number]>()
  for (const row of data ?? []) {
    if (!latest.has(row.consent_type)) {
      latest.set(row.consent_type, row)
    }
  }

  const now = Date.now()
  const active: ConsentType[] = []
  for (const row of latest.values()) {
    if (!row.granted || row.revoked_at != null) continue
    if (row.retention_days != null) {
      const expiresAt = new Date(row.granted_at).getTime() + row.retention_days * 86_400_000
      if (expiresAt <= now) continue
    }
    active.push(row.consent_type as ConsentType)
  }

  consentCache.set(profileId, { consents: active, fetchedAt: now })
  return active
}

export async function revokeConsent(
  profileId: string,
  consentType: ConsentType,
  supabase: SupabaseClient,
): Promise<boolean> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('consent_records')
    .update({ revoked_at: now })
    .eq('customer_id', profileId)
    .eq('consent_type', consentType)
    .is('revoked_at', null)
    .eq('granted', true)

  if (error) {
    console.error(`[revokeConsent] DB error for ${profileId}/${consentType}: ${error.message}`)
    return false
  }

  consentCache.delete(profileId)
  return true
}

export interface ConsentDenial {
  profileId: string
  toolId: string
  toolName: string
  requiredConsents: string[]
  missingConsents: string[]
  timestamp: string
}

export async function logConsentDenial(
  denial: ConsentDenial,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase.from('analytics_events').insert({
    session_id: null,
    profile_id: denial.profileId,
    event_type: 'consent_denial',
    metadata: {
      tool_id: denial.toolId,
      tool_name: denial.toolName,
      required_consents: denial.requiredConsents,
      missing_consents: denial.missingConsents,
    },
  })
}

export function buildConsentHint(missingConsents: string[], locale: string): string {
  const consentLabels: Record<string, Record<string, string>> = {
    de: {
      ai_personalization: 'KI-Personalisierung',
      memory_storage: 'Erinnerungsspeicher',
      ai_autonomy: 'KI-Autonomie',
      profiling_art22: 'Profiling (Art. 22 DSGVO)',
      data_processing: 'Datenverarbeitung',
      analytics: 'Analyse',
      data_retention: 'Datenspeicherung',
      cross_channel: 'Kanalübergreifende Nutzung',
      cross_device: 'Geräteübergreifende Nutzung',
      vehicle_data: 'Fahrzeugdaten',
      vehicle_control: 'Fahrzeugsteuerung',
      location_services: 'Standortdienste',
      marketing: 'Marketing',
      proactive_contact: 'Proaktive Kontaktaufnahme',
    },
    en: {
      ai_personalization: 'AI personalization',
      memory_storage: 'memory storage',
      ai_autonomy: 'AI autonomy',
      profiling_art22: 'profiling (Art. 22 GDPR)',
      data_processing: 'data processing',
      analytics: 'analytics',
      data_retention: 'data retention',
      cross_channel: 'cross-channel usage',
      cross_device: 'cross-device usage',
      vehicle_data: 'vehicle data',
      vehicle_control: 'vehicle control',
      location_services: 'location services',
      marketing: 'marketing',
      proactive_contact: 'proactive contact',
    },
  }

  const lang = locale.startsWith('de') ? 'de' : 'en'
  const labels = consentLabels[lang]
  const names = missingConsents.map(c => labels[c] ?? c)

  if (lang === 'de') {
    return `Für diese Funktion benötige ich Ihre Einwilligung für: ${names.join(', ')}. Sie können dies in Ihren Datenschutzeinstellungen aktivieren.`
  }
  return `This feature requires your consent for: ${names.join(', ')}. You can enable this in your privacy settings.`
}

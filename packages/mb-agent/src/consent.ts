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

export async function loadGrantedConsents(
  profileId: string | null,
  supabase: SupabaseClient,
): Promise<ConsentType[]> {
  if (!profileId) return []

  const cached = consentCache.get(profileId)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.consents
  }

  const { data } = await supabase
    .from('consent_records')
    .select('consent_type, granted_at, revoked_at, retention_days')
    .eq('customer_id', profileId)
    .eq('granted', true)
    .is('revoked_at', null)

  const now = Date.now()
  const active = (data ?? [])
    .filter(r => {
      if (r.retention_days != null) {
        const expiresAt = new Date(r.granted_at).getTime() + r.retention_days * 86_400_000
        return expiresAt > now
      }
      return true
    })
    .map(r => r.consent_type as ConsentType)

  const unique = [...new Set(active)]
  consentCache.set(profileId, { consents: unique, fetchedAt: now })
  return unique
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

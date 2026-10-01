import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModelPurpose } from './model-config.js'

export type TurnComplexity = 'simple' | 'complex'

export interface ClassificationResult {
  complexity: TurnComplexity
  purpose: ModelPurpose
  reason: string
}

export interface RoutingConfig {
  enabled: boolean
}

const COMPLEX_TOPIC_PATTERNS: RegExp[] = [
  /(?:^|[\s,.!?])(?:kauf|bestell|leas(?:ing|en)|finanzier|kredit|rate|anzahlung)\w*/i,
  /(?:^|[\s,.!?])(?:preis|koste[nt]|€|euro|rabatt|angebot)\w*/i,
  /(?:^|[\s,.!?])(?:service|werkstatt|inspektion|wartung|reparatur|garantie|rückruf)\w*/i,
  /(?:^|[\s,.!?])(?:start|stopp|öffne|schließ|klimaanlage|ladevorgang|verrieg|entrieg)\w*/i,
  /(?:^|[\s,.!?])(?:buche?|termin|probefahrt|testfahrt)\w*/i,
  /(?:^|[\s,.!?])(?:vertrag|stornierung|widerruf|reklamation|beschwerde)\w*/i,
  /(?:^|[\s,.!?])(?:konfigur|ausstatt|extra|paket|option|motor|getriebe)\w*/i,
  /(?:^|[\s,.!?])(?:ps|kw|nm|reichweite|kofferraum|verbrauch|beschleunigung|geschwindigkeit)\w*/i,
  /(?:^|[\s,.!?])(?:lieferstatus|lieferzeit|bestellung|abholtermin)\w*/i,
  /(?:^|[\s,.!?])(?:versicher|schutzbrief|mobilitätsgarantie)\w*/i,
]

const SIMPLE_PATTERNS: RegExp[] = [
  /^(hallo|hi|hey|guten\s*(tag|morgen|abend)|servus|moin)\s*[!?.]*$/i,
  /^(ja|nein|ok|danke|bitte|klar|genau|stimmt|richtig|passt)\s*[!?.]*$/i,
  /^(tschüss|auf wiedersehen|bye|ciao)\s*[!?.]*$/i,
  /^(👍|👎|✅|❌|🙏|😊)+$/,
]

const TOOL_TRIGGER_PATTERNS: RegExp[] = [
  /(?:^|[\s,.!?])(?:zeig|such|find|vergleich)\w*/i,
  /(?:^|[\s,.!?])(?:mein|meine[rnms]?)\s+(?:auto|fahrzeug|wagen|flotte)/i,
  /(?:^|[\s,.!?])(?:speicher|lösch|merke?)\b/i,
  /(?:^|[\s,.!?])status\b/i,
]

let configCache: { config: RoutingConfig; expiresAt: number } | null = null
const CACHE_TTL_MS = 30_000

export async function loadRoutingConfig(supabase: SupabaseClient): Promise<RoutingConfig> {
  if (configCache && Date.now() < configCache.expiresAt) return configCache.config

  const { data } = await supabase
    .from('cost_gate_config')
    .select('key, value')
    .in('key', ['fast_routing_enabled'])

  const configMap = new Map((data ?? []).map(r => [r.key, r.value]))

  const raw = configMap.get('fast_routing_enabled')
  const config: RoutingConfig = {
    enabled: raw === true || raw === 'true' || raw === 1 || raw === '1',
  }

  configCache = { config, expiresAt: Date.now() + CACHE_TTL_MS }
  return config
}

export function invalidateRoutingConfig(): void {
  configCache = null
}

export function classifyTurn(input: string): ClassificationResult {
  const trimmed = input.trim()

  if (trimmed.length === 0) {
    return { complexity: 'simple', purpose: 'fast', reason: 'empty-input' }
  }

  for (const pattern of COMPLEX_TOPIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { complexity: 'complex', purpose: 'main', reason: 'complex-topic' }
    }
  }

  for (const pattern of TOOL_TRIGGER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { complexity: 'complex', purpose: 'main', reason: 'tool-trigger' }
    }
  }

  for (const pattern of SIMPLE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { complexity: 'simple', purpose: 'fast', reason: 'simple-pattern' }
    }
  }

  if (trimmed.length <= 20 && !trimmed.includes('?')) {
    return { complexity: 'simple', purpose: 'fast', reason: 'short-no-question' }
  }

  return { complexity: 'complex', purpose: 'main', reason: 'default-complex' }
}

export async function resolveRoutingPurpose(
  input: string,
  supabase: SupabaseClient,
): Promise<ClassificationResult> {
  const config = await loadRoutingConfig(supabase)
  const classification = classifyTurn(input)

  if (!config.enabled) {
    return { complexity: classification.complexity, purpose: 'main', reason: `disabled:${classification.reason}` }
  }

  return classification
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CCPPersonality, Channel, CustomerContext, JourneyPhase, MemoryType, ProactivityLevel,
} from './types.js'
import { resolveActivePrompt } from './prompt-versioning.js'
import type { PromptVersion } from './prompt-versioning.js'
import { buildFewShotBlock } from './few-shot-guardrails.js'
import { buildStateTrackingLayer } from './state-tracking.js'
import type { ConversationState } from './state-tracking.js'
import { resolveExperimentPromptVersion } from './ab-testing.js'
import type { ExperimentAssignment } from './ab-testing.js'

export interface ResolvedPersonalityWithVersion extends CCPPersonality {
  promptVersion: number | null
}

export interface ResolvedPersonalityResult extends ResolvedPersonalityWithVersion {
  experimentAssignment?: ExperimentAssignment | null
}

export async function resolvePersonality(
  context: CustomerContext,
  supabase: SupabaseClient,
  subjectId?: string,
): Promise<ResolvedPersonalityResult> {
  const { data } = await supabase
    .from('ccp_routing_rules')
    .select('personality_id, priority')
    .eq('is_active', true)
    .or(`journey_phase.eq.${context.journeyPhase},journey_phase.is.null`)
    .or(`pid_min.lte.${context.pidScore},pid_min.is.null`)
    .order('priority', { ascending: false })
    .limit(1)
    .maybeSingle()

  const personalityId = data?.personality_id ?? 'default'

  const { data: personality } = await supabase
    .from('ccp_personalities')
    .select('*')
    .eq('id', personalityId)
    .single()

  if (!personality) return { ...defaultPersonality(), promptVersion: null, experimentAssignment: null }

  let experimentAssignment: ExperimentAssignment | null = null
  if (subjectId) {
    experimentAssignment = await resolveExperimentPromptVersion(personalityId, subjectId, supabase)
  }

  let activePrompt: PromptVersion | null = null
  if (experimentAssignment) {
    const { data: expPrompt } = await supabase
      .from('ccp_prompt_versions')
      .select('*')
      .eq('id', experimentAssignment.promptVersionId)
      .single()
    if (expPrompt) activePrompt = mapPromptRow(expPrompt)
  }

  if (!activePrompt) {
    activePrompt = await resolveActivePrompt(personality.id, supabase)
  }

  const staticPrompt = activePrompt?.staticPrompt ?? personality.system_prompt

  return {
    id: personality.id,
    slug: personality.slug,
    displayName: personality.display_name,
    systemPrompt: staticPrompt,
    temperature: personality.temperature,
    promptVersion: activePrompt?.version ?? null,
    experimentAssignment,
  }
}

function mapPromptRow(row: Record<string, unknown>): PromptVersion {
  return {
    id: row.id as string,
    personalityId: row.personality_id as string,
    version: row.version as number,
    staticPrompt: row.static_prompt as string,
    isActive: row.is_active as boolean,
    activatedAt: (row.activated_at as string) ?? null,
    activatedBy: (row.activated_by as string) ?? null,
    createdAt: row.created_at as string,
  }
}

function defaultPersonality(): CCPPersonality {
  return {
    id: 'default',
    slug: 'mercedes-assistant',
    displayName: 'Mercedes-Benz Assistent',
    systemPrompt: 'Du bist der Mercedes-Benz Assistent.',
    temperature: 0.3,
  }
}

export function getChannelRules(channel: Channel): string {
  const rules: Record<Channel, string> = {
    web: 'Antworten mit Rich-Media (Bilder, Konfigurator-Links). Markdown verwenden.',
    smart_storefront: 'Interaktive Beratung mit Showroom-Elementen. Auf großem Bildschirm optimiert.',
    whatsapp: 'Kurze, prägnante Nachrichten. Max 3 Absätze. Keine komplexen Tabellen.',
    mbux: 'Sprachoptimiert, kurze Sätze. Keine visuellen Elemente referenzieren.',
    voice: 'Natürliche Sprache, keine Abkürzungen. Unter 30 Sekunden Sprechzeit.',
    app: 'Mobile-optimiert. Deep Links zur Mercedes me App nutzen.',
    dealer: 'Professioneller Ton. Händler-spezifische Informationen priorisieren.',
  }
  return rules[channel]
}

export function getJourneyPhaseRules(phase: JourneyPhase): string {
  const rules: Record<JourneyPhase, string> = {
    awareness: 'Inspirieren und Markenwerte vermitteln. Emotionale Ansprache.',
    research: 'Technische Details und Vergleiche bereitstellen. Objektiv und informativ.',
    configuration: 'Aktiv bei der Konfiguration unterstützen. Empfehlungen basierend auf Präferenzen geben.',
    pricing: 'Transparente Preisinformationen. Finanzierungsoptionen aufzeigen.',
    purchase: 'Kaufentscheidung unterstützen. Händler-Kontakt anbieten.',
    order: 'Bestellstatus proaktiv kommunizieren. Lieferzeiten transparent halten.',
    onboarding: 'Fahrzeugfunktionen erklären. Ersteinrichtung begleiten.',
    ownership: 'Wartungserinnerungen, Tipps zur Fahrzeugpflege. Proaktive Serviceangebote.',
    service: 'Schnelle Terminbuchung ermöglichen. Werkstatt-Empfehlungen nach Nähe.',
    lifecycle: 'Neue Modelle vorstellen. Upgrade-Möglichkeiten aufzeigen.',
  }
  return rules[phase]
}

export function getProactivityRules(level: ProactivityLevel): string {
  const rules: Record<ProactivityLevel, string> = {
    still: 'Nur auf direkte Fragen antworten. Keine proaktiven Vorschläge.',
    ready: 'Bereit für Interaktion, aber nicht initiativ. Schnelle Antworten.',
    attentive: 'Kontextuelle Hinweise geben wenn relevant. Sanfte Empfehlungen.',
    accompanying: 'Aktiv begleiten. Nächste Schritte vorschlagen. Follow-ups planen.',
    engaged: 'Proaktiv beraten. Personalisierte Empfehlungen. Cross-/Up-Selling.',
  }
  return rules[level]
}

interface AgentMemory {
  type: MemoryType
  content: string
}

export interface PromptBuild {
  full: string
  staticPart: string
  dynamicPart: string
}

export function buildSystemPrompt(
  personality: CCPPersonality,
  customer: CustomerContext,
  memories: AgentMemory[],
  channel: Channel,
  market: string,
  conversationState?: ConversationState | null,
): string {
  const { full } = buildSystemPromptSplit(personality, customer, memories, channel, market, conversationState)
  return full
}

export function buildSystemPromptSplit(
  personality: CCPPersonality,
  customer: CustomerContext,
  memories: AgentMemory[],
  channel: Channel,
  market: string,
  conversationState?: ConversationState | null,
): PromptBuild {
  const staticPart = `${personality.systemPrompt}\n\n${buildFewShotBlock()}`

  const dynamicLayers = [
    `Markt: ${market}. Sprache: ${customer.locale}.`,
    getChannelRules(channel),
    getJourneyPhaseRules(customer.journeyPhase),
    getProactivityRules(customer.proactivityLevel),
    buildIdentityLayer(customer),
    buildMemoryLayer(memories),
    buildStateTrackingLayer(conversationState ?? null),
    buildGuardrailLayer(),
    buildComplianceLayer(market),
  ]
  const dynamicPart = dynamicLayers.filter(Boolean).join('\n\n')

  return {
    full: [staticPart, dynamicPart].filter(Boolean).join('\n\n'),
    staticPart,
    dynamicPart,
  }
}

function buildIdentityLayer(customer: CustomerContext): string {
  const parts = [`PID-Score: ${customer.pidScore}/100.`]
  if (customer.displayName) parts.push(`Anrede: ${customer.displayName}.`)
  if (customer.vehicles.length > 0) {
    const names = customer.vehicles.map(v => v.modelName).join(', ')
    parts.push(`Fahrzeuge: ${names}.`)
  }
  return parts.join(' ')
}

function buildMemoryLayer(memories: AgentMemory[]): string {
  if (memories.length === 0) return ''
  const lines = memories.map(m => `- [${m.type}] ${m.content}`)
  return `Bekannte Informationen:\n${lines.join('\n')}`
}

function buildGuardrailLayer(): string {
  return [
    'Sicherheitsregeln:',
    '- Keine erfundenen Preise oder Verfügbarkeiten nennen.',
    '- Bei Unsicherheit an den Händler verweisen.',
    '- Keine Wettbewerber-Vergleiche initiieren.',
    '- Persönliche Daten nur mit Einwilligung verarbeiten.',
  ].join('\n')
}

function buildComplianceLayer(market: string): string {
  return `Compliance (${market}): DSGVO einhalten. Impressum und Datenschutz auf Anfrage bereitstellen.`
}

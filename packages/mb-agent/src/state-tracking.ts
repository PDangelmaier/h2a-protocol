import type { SupabaseClient } from '@supabase/supabase-js'
import type { NexusConfig } from './types.js'
import { resolveModel, resolveFallbackChain } from './model-config.js'
import { checkCostLimit } from './cost-gate.js'
import { callNexusFallbackGated } from './nexus-gateway.js'

export type Sentiment = 'positiv' | 'neutral' | 'negativ'
export type Resolution = 'offen' | 'gelöst' | 'eskaliert'

export interface ConversationState {
  topic: string | null
  sentiment: Sentiment
  resolution: Resolution
}

export interface StateTrackingResult {
  state: ConversationState
  escalationTriggered: boolean
}

interface StateRow {
  id: string
  session_id: string
  turn_index: number
  topic: string | null
  sentiment: Sentiment
  resolution: Resolution
  escalation_event_emitted: boolean
}

const VALID_SENTIMENTS: Sentiment[] = ['positiv', 'neutral', 'negativ']
const VALID_RESOLUTIONS: Resolution[] = ['offen', 'gelöst', 'eskaliert']

const STATE_EXTRACTION_PROMPT = `Analysiere diesen Gesprächs-Turn und extrahiere den aktuellen Zustand.
Antworte NUR mit einem JSON-Objekt: { "topic": "<Hauptthema oder null>", "sentiment": "positiv"|"neutral"|"negativ", "resolution": "offen"|"gelöst"|"eskaliert" }
- topic: Das Hauptthema der Konversation (z.B. "Probefahrt buchen", "Serviceintervall", "Konfiguration EQS")
- sentiment: Die aktuelle Stimmung des Kunden
- resolution: Ob die Anfrage offen, gelöst oder an einen Menschen eskaliert wurde`

export function validateStateOutput(raw: unknown): ConversationState | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const sentiment = VALID_SENTIMENTS.includes(obj.sentiment as Sentiment)
    ? (obj.sentiment as Sentiment)
    : null
  const resolution = VALID_RESOLUTIONS.includes(obj.resolution as Resolution)
    ? (obj.resolution as Resolution)
    : null
  if (!sentiment || !resolution) return null
  return {
    topic: typeof obj.topic === 'string' && obj.topic.length > 0 ? obj.topic : null,
    sentiment,
    resolution,
  }
}

export async function trackConversationState(
  sessionId: string,
  turnContent: { user: string; assistant: string },
  nexusConfig: NexusConfig,
  supabase: SupabaseClient,
): Promise<StateTrackingResult | null> {
  const costCheck = await checkCostLimit(sessionId, supabase, 'de')
  if (costCheck.exceeded) return null

  const modelId = await resolveModel('memory-extraction', supabase)
  const fallbackChain = await resolveFallbackChain('memory-extraction', supabase)

  const request = {
    modelId,
    system: [{ text: STATE_EXTRACTION_PROMPT }],
    messages: [{
      role: 'user',
      content: [{ text: JSON.stringify({ user: turnContent.user, assistant: turnContent.assistant }) }],
    }],
    inferenceConfig: { temperature: 0.1, maxTokens: 256 },
  }

  const fbResult = await callNexusFallbackGated(request, fallbackChain, nexusConfig, 'memory-extraction', sessionId, supabase)

  let parsed: unknown
  try {
    parsed = JSON.parse(fbResult.text)
  } catch {
    return null
  }

  const state = validateStateOutput(parsed)
  if (!state) return null

  const previousStates = await loadRecentStates(sessionId, supabase, 2)
  const turnIndex = previousStates.length > 0
    ? Math.max(...previousStates.map(s => s.turn_index)) + 1
    : 0

  await persistState(sessionId, turnIndex, state, supabase)

  const escalationTriggered = checkDoubleNegativeEscalation(state, previousStates)
  if (escalationTriggered) {
    await markEscalationEmitted(sessionId, turnIndex, supabase)
  }

  return { state, escalationTriggered }
}

async function loadRecentStates(
  sessionId: string,
  supabase: SupabaseClient,
  limit: number,
): Promise<StateRow[]> {
  const { data } = await supabase
    .from('session_state')
    .select('*')
    .eq('session_id', sessionId)
    .order('turn_index', { ascending: false })
    .limit(limit)

  return (data ?? []) as StateRow[]
}

async function persistState(
  sessionId: string,
  turnIndex: number,
  state: ConversationState,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase.from('session_state').insert({
    session_id: sessionId,
    turn_index: turnIndex,
    topic: state.topic,
    sentiment: state.sentiment,
    resolution: state.resolution,
  })
}

async function markEscalationEmitted(
  sessionId: string,
  turnIndex: number,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase
    .from('session_state')
    .update({ escalation_event_emitted: true })
    .eq('session_id', sessionId)
    .eq('turn_index', turnIndex)
}

export function checkDoubleNegativeEscalation(
  current: ConversationState,
  previousStates: StateRow[],
): boolean {
  if (current.sentiment !== 'negativ') return false
  if (previousStates.length === 0) return false
  const lastState = previousStates[0]
  if (lastState.escalation_event_emitted) return false
  return lastState.sentiment === 'negativ'
}

export async function loadLatestState(
  sessionId: string,
  supabase: SupabaseClient,
): Promise<ConversationState | null> {
  const { data } = await supabase
    .from('session_state')
    .select('topic, sentiment, resolution')
    .eq('session_id', sessionId)
    .order('turn_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    topic: data.topic,
    sentiment: data.sentiment as Sentiment,
    resolution: data.resolution as Resolution,
  }
}

export function buildStateTrackingLayer(state: ConversationState | null): string {
  if (!state) return ''
  const parts = ['Aktueller Gesprächszustand:']
  if (state.topic) parts.push(`Thema: ${state.topic}.`)
  parts.push(`Stimmung: ${state.sentiment}.`)
  parts.push(`Lösungsstand: ${state.resolution}.`)
  return parts.join(' ')
}

export function buildEscalationHint(locale: string): string {
  if (locale.startsWith('en')) {
    return 'The customer seems frustrated. Offer a direct contact channel (phone, dealer) and acknowledge the issue.'
  }
  return 'Der Kunde wirkt frustriert. Biete einen direkten Kontaktweg an (Telefon, Händler) und zeige Verständnis.'
}

export { STATE_EXTRACTION_PROMPT, VALID_SENTIMENTS, VALID_RESOLUTIONS }

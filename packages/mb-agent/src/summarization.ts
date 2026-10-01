import type { SupabaseClient } from '@supabase/supabase-js'
import type { NexusConfig } from './types.js'
import { resolveModel } from './model-config.js'
import { callNexusSync } from './nexus.js'
import { estimateTokens } from './token-estimation.js'
import { trackNexusCost } from './cost-gate.js'

export interface SummarizationConfig {
  softLimitTokens: number
  hardLimitTokens: number
  keepRecentTurns: number
}

export interface ConversationSummary {
  id: string
  sessionId: string
  summary: string
  turnRangeStart: number
  turnRangeEnd: number
  modelUsed: string
  tokenCount: number
  createdAt: string
}

interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
  sequence: number
}

const DEFAULT_CONFIG: SummarizationConfig = {
  softLimitTokens: 8_000,
  hardLimitTokens: 12_000,
  keepRecentTurns: 6,
}

export function getSummarizationConfig(): SummarizationConfig {
  return { ...DEFAULT_CONFIG }
}

export function estimateSessionTokens(
  systemPrompt: string,
  turns: Array<{ role: string; content: string }>,
  toolTokens: number,
): number {
  const systemTokens = estimateTokens(systemPrompt)
  const historyTokens = turns.reduce((sum, t) => sum + estimateTokens(t.content), 0)
  return systemTokens + historyTokens + toolTokens
}

export function needsSummarization(
  estimatedTokens: number,
  config?: SummarizationConfig,
): boolean {
  const cfg = config ?? DEFAULT_CONFIG
  return estimatedTokens > cfg.softLimitTokens
}

export function exceedsHardLimit(
  estimatedTokens: number,
  config?: SummarizationConfig,
): boolean {
  const cfg = config ?? DEFAULT_CONFIG
  return estimatedTokens > cfg.hardLimitTokens
}

export async function summarizeOlderTurns(
  sessionId: string,
  turns: ConversationTurn[],
  nexusConfig: NexusConfig,
  supabase: SupabaseClient,
  config?: SummarizationConfig,
): Promise<ConversationSummary | null> {
  const cfg = config ?? DEFAULT_CONFIG
  if (turns.length <= cfg.keepRecentTurns) return null

  const olderTurns = turns.slice(0, turns.length - cfg.keepRecentTurns)
  if (olderTurns.length === 0) return null

  const modelId = await resolveModel('summarization', supabase)

  const turnText = olderTurns
    .map(t => `${t.role}: ${t.content}`)
    .join('\n\n')

  const request = {
    modelId,
    system: [{ text: 'Summarize the following conversation turns concisely. Preserve key facts, decisions, and context. Output only the summary, no preamble.' }],
    messages: [{ role: 'user', content: [{ text: turnText }] }],
    inferenceConfig: { temperature: 0, maxTokens: 512 },
  }

  const result = await callNexusSync(request, nexusConfig)
  await trackNexusCost(sessionId, 'summarization', result, supabase)

  const summary = result.text.trim()
  const tokenCount = estimateTokens(summary)
  const turnRangeStart = olderTurns[0].sequence
  const turnRangeEnd = olderTurns[olderTurns.length - 1].sequence

  const { data, error } = await supabase
    .from('conversation_summaries')
    .insert({
      session_id: sessionId,
      summary,
      turn_range_start: turnRangeStart,
      turn_range_end: turnRangeEnd,
      model_used: modelId,
      token_count: tokenCount,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to store summary: ${error.message}`)

  return mapSummaryRow(data)
}

export async function loadLatestSummary(
  sessionId: string,
  supabase: SupabaseClient,
): Promise<ConversationSummary | null> {
  const { data } = await supabase
    .from('conversation_summaries')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ? mapSummaryRow(data) : null
}

export function enforceHardLimit(
  systemPrompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
  toolTokens: number,
  config?: SummarizationConfig,
): Array<{ role: string; content: string }> {
  const cfg = config ?? DEFAULT_CONFIG
  const systemTokens = estimateTokens(systemPrompt)
  const fixedTokens = systemTokens + toolTokens

  if (fixedTokens >= cfg.hardLimitTokens) {
    return conversationHistory.slice(-2)
  }

  let budget = cfg.hardLimitTokens - fixedTokens
  const result: Array<{ role: string; content: string }> = []

  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(conversationHistory[i].content)
    if (budget - tokens < 0 && result.length >= 2) break
    budget -= tokens
    result.unshift(conversationHistory[i])
  }

  return result
}

export function buildHistoryWithSummary(
  summary: ConversationSummary | null,
  recentTurns: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  if (!summary) return recentTurns

  return [
    { role: 'user', content: `[Previous conversation summary: ${summary.summary}]` },
    { role: 'assistant', content: 'Understood, I have the context from our previous conversation.' },
    ...recentTurns,
  ]
}

function mapSummaryRow(row: Record<string, unknown>): ConversationSummary {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    summary: row.summary as string,
    turnRangeStart: row.turn_range_start as number,
    turnRangeEnd: row.turn_range_end as number,
    modelUsed: row.model_used as string,
    tokenCount: row.token_count as number,
    createdAt: row.created_at as string,
  }
}

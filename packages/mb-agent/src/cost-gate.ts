import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModelPurpose } from './model-config.js'
import type { NexusStreamResult } from './nexus.js'
import { resolveModelPricing, resolveModelPricingByModelId } from './model-config.js'
import { estimateTokens } from './token-estimation.js'
import { trackCostLimitReached, trackTokenBudgetExceeded } from './langfuse.js'

export interface CostTrackResult {
  costUsd: number
  totalCostUsd: number
  callCount: number
}

export interface CostLimitCheck {
  exceeded: boolean
  totalCostUsd: number
  limitEur: number
  shutdownMessage?: string
}

export interface TokenEstimate {
  total: number
  systemTokens: number
  historyTokens: number
  toolTokens: number
}

const SOFT_TOKEN_LIMIT = 8_000

export async function trackNexusCost(
  sessionId: string,
  purpose: ModelPurpose,
  result: Pick<NexusStreamResult, 'inputTokens' | 'outputTokens' | 'cacheReadInputTokens'>,
  supabase: SupabaseClient,
  actualModelId?: string,
): Promise<CostTrackResult> {
  const pricing = actualModelId
    ? await resolveModelPricingByModelId(actualModelId, supabase)
    : await resolveModelPricing(purpose, supabase)
  const cachedTokens = result.cacheReadInputTokens ?? 0
  const uncachedInputTokens = result.inputTokens - cachedTokens
  const costUsd =
    (uncachedInputTokens * pricing.costPerInput1k +
      cachedTokens * pricing.costPerCachedInput1k +
      result.outputTokens * pricing.costPerOutput1k) /
    1000

  const { data, error } = await supabase.rpc('increment_session_cost', {
    p_session_id: sessionId,
    p_cost_delta: costUsd,
    p_input_tokens: result.inputTokens,
  })

  if (error) {
    throw new Error(`Cost tracking failed for session "${sessionId}": ${error.message}`)
  }

  const row = data as { cost_usd: number; nexus_call_count: number }
  return {
    costUsd,
    totalCostUsd: Number(row.cost_usd),
    callCount: Number(row.nexus_call_count),
  }
}

export async function checkCostLimit(
  sessionId: string,
  supabase: SupabaseClient,
  locale: string,
): Promise<CostLimitCheck> {
  const [sessionRow, configRows] = await Promise.all([
    supabase
      .from('sessions')
      .select('cost_usd, nexus_call_count')
      .eq('h2a_session_id', sessionId)
      .single(),
    supabase
      .from('cost_gate_config')
      .select('key, value')
      .in('key', ['cost_limit_eur', 'usd_eur_rate']),
  ])

  if (sessionRow.error || !sessionRow.data) {
    throw new Error(`Cannot read session cost for "${sessionId}"`)
  }

  const config = new Map(
    (configRows.data ?? []).map((r: { key: string; value: number }) => [r.key, Number(r.value)]),
  )
  const limitEur = config.get('cost_limit_eur') ?? 0.5
  const rate = config.get('usd_eur_rate') ?? 0.92

  const totalCostUsd = Number(sessionRow.data.cost_usd)
  const callCount = Number(sessionRow.data.nexus_call_count ?? 0)
  const costEur = totalCostUsd * rate
  const exceeded = costEur > limitEur

  if (exceeded) {
    trackCostLimitReached(sessionId, totalCostUsd, costEur, callCount).catch(() => {})
  }

  return {
    exceeded,
    totalCostUsd,
    limitEur,
    shutdownMessage: exceeded
      ? locale === 'de'
        ? 'Diese Sitzung hat das Kostenlimit erreicht. Bitte starten Sie eine neue Sitzung.'
        : 'This session has reached its cost limit. Please start a new session.'
      : undefined,
  }
}

export function estimateInputTokens(
  systemPrompt: string,
  messages: Array<{ role: string; content: Array<Record<string, unknown>> }>,
  toolConfig?: { tools: Array<unknown> },
): TokenEstimate {
  const systemTokens = estimateTokens(systemPrompt)
  const historyTokens = messages.reduce(
    (sum, m) => sum + m.content.reduce((s, c) => {
      if ('text' in c && typeof c.text === 'string') return s + estimateTokens(c.text)
      return s + estimateTokens(c)
    }, 0),
    0,
  )
  const toolTokens = toolConfig ? estimateTokens(toolConfig) : 0

  return {
    total: systemTokens + historyTokens + toolTokens,
    systemTokens,
    historyTokens,
    toolTokens,
  }
}

export async function checkTokenBudget(
  sessionId: string,
  estimate: TokenEstimate,
): Promise<boolean> {
  if (estimate.total <= SOFT_TOKEN_LIMIT) return true

  trackTokenBudgetExceeded(sessionId, estimate).catch(() => {})
  return false
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NexusRequest, NexusStreamResult } from './nexus.js'
import type { NexusConfig } from './types.js'
import type { FallbackChainEntry, ModelPurpose } from './model-config.js'
import type { FallbackResult } from './fallback.js'
import { callWithCacheFallback } from './prompt-cache.js'
import { callWithFallback } from './fallback.js'
import { callNexusSync } from './nexus.js'
import { trackNexusCost, checkCostLimit, resolveTimeBudgetMs } from './cost-gate.js'
import type { CostLimitCheck } from './cost-gate.js'

export interface GatewayCallResult {
  result: FallbackResult
  cacheRejected: boolean
  costCheck: CostLimitCheck | null
}

export interface SyncGatewayResult {
  result: NexusStreamResult
  costCheck: CostLimitCheck | null
}

export class CostLimitExceededError extends Error {
  constructor(public readonly check: CostLimitCheck) {
    super('Cost limit exceeded before Nexus call')
    this.name = 'CostLimitExceededError'
  }
}

export async function callNexusGated(
  request: NexusRequest,
  chain: FallbackChainEntry[],
  nexusConfig: NexusConfig,
  purpose: ModelPurpose,
  sessionId: string,
  locale: string,
  supabase: SupabaseClient,
  opts?: { skipPreCheck?: boolean },
): Promise<GatewayCallResult> {
  if (!opts?.skipPreCheck) {
    const preCheck = await checkCostLimit(sessionId, supabase, locale)
    if (preCheck.exceeded) throw new CostLimitExceededError(preCheck)
  }

  const timeBudgetMs = await resolveTimeBudgetMs(supabase)
  const { result, cacheRejected } = await callWithCacheFallback(
    request, chain, nexusConfig, purpose, { timeBudgetMs },
  )

  await trackNexusCost(sessionId, purpose, result, supabase, result.actualModelId)

  return { result, cacheRejected, costCheck: null }
}

export async function callNexusFallbackGated(
  request: NexusRequest,
  chain: FallbackChainEntry[],
  nexusConfig: NexusConfig,
  purpose: ModelPurpose,
  sessionId: string,
  supabase: SupabaseClient,
): Promise<FallbackResult> {
  const timeBudgetMs = await resolveTimeBudgetMs(supabase)
  const result = await callWithFallback(request, chain, nexusConfig, purpose, { timeBudgetMs })
  await trackNexusCost(sessionId, purpose, result, supabase, result.actualModelId)
  return result
}

export async function callNexusSyncGated(
  request: NexusRequest,
  nexusConfig: NexusConfig,
  purpose: ModelPurpose,
  sessionId: string,
  supabase: SupabaseClient,
): Promise<SyncGatewayResult> {
  const result = await callNexusSync(request, nexusConfig)
  await trackNexusCost(sessionId, purpose, result, supabase, request.modelId)
  return { result, costCheck: null }
}

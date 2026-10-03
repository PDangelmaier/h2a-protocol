import type { NexusConfig } from './types.js'
import type { NexusRequest, NexusStreamResult } from './nexus.js'
import type { FallbackChainEntry } from './model-config.js'
import { callNexusSync, NexusError } from './nexus.js'
import { trackModelFallback } from './langfuse.js'

const DEFAULT_TIME_BUDGET_MS = 20_000

export interface FallbackOptions {
  timeBudgetMs?: number
}

export interface FallbackResult extends NexusStreamResult {
  actualModelId: string
  fallbacksUsed: number
}

export interface ModelFallbackEvent {
  purpose: string
  fromModel: string
  toModel: string
  errorClass: string
}

function classifyError(err: unknown): { retryable: boolean; errorClass: string } {
  if (err instanceof NexusError) {
    if (err.statusCode === 429) return { retryable: true, errorClass: 'rate_limit' }
    if (err.statusCode >= 500) return { retryable: true, errorClass: 'server_error' }
    if (err.statusCode === 0 || err.message.includes('not available'))
      return { retryable: true, errorClass: 'model_unavailable' }
    return { retryable: false, errorClass: `client_error_${err.statusCode}` }
  }
  if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('timeout')))
    return { retryable: true, errorClass: 'timeout' }
  return { retryable: false, errorClass: 'unknown' }
}

export async function callWithFallback(
  request: NexusRequest,
  chain: FallbackChainEntry[],
  nexusConfig: NexusConfig,
  purpose: string,
  opts?: FallbackOptions,
): Promise<FallbackResult> {
  const timeBudget = opts?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS
  const deadline = Date.now() + timeBudget
  let lastError: unknown

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i]
    const remaining = deadline - Date.now()
    if (remaining <= 0) break

    const req = { ...request, modelId: entry.modelId }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), remaining)

      const result = await callNexusSync(req, nexusConfig, { signal: controller.signal })
      clearTimeout(timer)

      return { ...result, actualModelId: entry.modelId, fallbacksUsed: i }
    } catch (err) {
      lastError = err
      const { retryable, errorClass } = classifyError(err)

      if (!retryable) {
        throw err
      }

      const nextEntry = chain[i + 1]
      if (nextEntry) {
        trackModelFallback({
          purpose,
          fromModel: entry.modelId,
          toModel: nextEntry.modelId,
          errorClass,
        }).catch(() => {})
      }
    }
  }

  const remainingAfterChain = deadline - Date.now()
  if (remainingAfterChain <= 0) {
    throw new FallbackTimeoutError(
      `Fallback chain exhausted: time budget ${timeBudget}ms exceeded`,
      timeBudget,
    )
  }

  throw new FallbackChainExhaustedError(
    `All ${chain.length} models in fallback chain failed`,
    chain.length,
    lastError,
  )
}

export class FallbackTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeBudgetMs: number,
  ) {
    super(message)
    this.name = 'FallbackTimeoutError'
  }
}

export class FallbackChainExhaustedError extends Error {
  constructor(
    message: string,
    public readonly chainLength: number,
    public readonly lastError: unknown,
  ) {
    super(message)
    this.name = 'FallbackChainExhaustedError'
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NexusRequest } from './nexus.js'
import type { FallbackResult } from './fallback.js'
import type { FallbackChainEntry } from './model-config.js'
import type { NexusConfig } from './types.js'
import { callWithFallback } from './fallback.js'
import { NexusError } from './nexus.js'

export interface PromptCacheConfig {
  enabled: boolean
}

let configCache: { config: PromptCacheConfig; expiresAt: number } | null = null
const CACHE_TTL_MS = 30_000

export function invalidatePromptCacheConfig(): void {
  configCache = null
}

export async function loadPromptCacheConfig(
  supabase: SupabaseClient,
): Promise<PromptCacheConfig> {
  if (configCache && configCache.expiresAt > Date.now()) {
    return configCache.config
  }

  const { data } = await supabase
    .from('cost_gate_config')
    .select('key, value')
    .eq('key', 'prompt_cache_enabled')
    .maybeSingle()

  const enabled = data ? data.value === true || data.value === 'true' || data.value === 1 : false
  const config = { enabled }

  configCache = { config, expiresAt: Date.now() + CACHE_TTL_MS }
  return config
}

export interface SystemBlock {
  text?: string
  cachePoint?: { type: 'default' }
}

export function buildCachedSystemBlocks(
  staticPart: string,
  dynamicPart: string,
  cacheEnabled: boolean,
): SystemBlock[] {
  if (!cacheEnabled || !staticPart) {
    return [{ text: [staticPart, dynamicPart].filter(Boolean).join('\n\n') }]
  }

  const blocks: SystemBlock[] = [
    { text: staticPart },
    { cachePoint: { type: 'default' } },
  ]
  if (dynamicPart) {
    blocks.push({ text: dynamicPart })
  }
  return blocks
}

export function applyCacheToRequest(
  request: NexusRequest,
  staticPart: string,
  dynamicPart: string,
  cacheEnabled: boolean,
): NexusRequest {
  const system = buildCachedSystemBlocks(staticPart, dynamicPart, cacheEnabled)
  return { ...request, system }
}

export function removeCacheMarkers(request: NexusRequest): NexusRequest {
  const system = request.system
    .filter(block => !('cachePoint' in block))
  return { ...request, system }
}

export function hasCacheMarkers(request: NexusRequest): boolean {
  return request.system.some(block => 'cachePoint' in block)
}

function isCacheRejection(err: unknown): boolean {
  if (err instanceof NexusError) {
    return err.statusCode === 400 && err.message.includes('cache')
  }
  return false
}

export interface CacheFallbackResult {
  result: FallbackResult
  cacheRejected: boolean
}

export async function callWithCacheFallback(
  request: NexusRequest,
  chain: FallbackChainEntry[],
  nexusConfig: NexusConfig,
  purpose: string,
): Promise<CacheFallbackResult> {
  if (!hasCacheMarkers(request)) {
    const result = await callWithFallback(request, chain, nexusConfig, purpose)
    return { result, cacheRejected: false }
  }

  try {
    const result = await callWithFallback(request, chain, nexusConfig, purpose)
    return { result, cacheRejected: false }
  } catch (err) {
    if (isCacheRejection(err)) {
      const retryRequest = removeCacheMarkers(request)
      const result = await callWithFallback(retryRequest, chain, nexusConfig, purpose)
      return { result, cacheRejected: true }
    }
    throw err
  }
}

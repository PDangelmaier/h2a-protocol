import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadPromptCacheConfig,
  invalidatePromptCacheConfig,
  buildCachedSystemBlocks,
  applyCacheToRequest,
  removeCacheMarkers,
  hasCacheMarkers,
  callWithCacheFallback,
} from '../prompt-cache.js'
import type { NexusRequest } from '../nexus.js'
import { NexusError } from '../nexus.js'

vi.mock('../fallback.js', () => ({
  callWithFallback: vi.fn(),
}))

vi.mock('../nexus.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../nexus.js')>()
  return { ...actual }
})

import { callWithFallback } from '../fallback.js'

const mockCallWithFallback = vi.mocked(callWithFallback)

function makeFallbackResult(overrides: Partial<Awaited<ReturnType<typeof callWithFallback>>> = {}) {
  return {
    text: 'hello',
    toolCalls: [],
    stopReason: 'end_turn',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadInputTokens: 0,
    actualModelId: 'claude-sonnet-4-6',
    fallbacksUsed: 0,
    ...overrides,
  }
}

function makeRequest(system: NexusRequest['system'] = [{ text: 'You are helpful.' }]): NexusRequest {
  return {
    modelId: 'claude-sonnet-4-6',
    system,
    messages: [{ role: 'user', content: [{ text: 'hi' }] }],
    inferenceConfig: { temperature: 0.7, maxTokens: 2048 },
  }
}

function mockSupabase(value: unknown = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: value, error: null }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof loadPromptCacheConfig>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  invalidatePromptCacheConfig()
})

describe('loadPromptCacheConfig', () => {
  it('returns enabled=false when no config row exists (AC-1 default off)', async () => {
    const config = await loadPromptCacheConfig(mockSupabase(null))
    expect(config.enabled).toBe(false)
  })

  it('returns enabled=true when value is 1', async () => {
    const config = await loadPromptCacheConfig(mockSupabase({ key: 'prompt_cache_enabled', value: 1 }))
    expect(config.enabled).toBe(true)
  })

  it('returns enabled=true when value is "true"', async () => {
    const config = await loadPromptCacheConfig(mockSupabase({ key: 'prompt_cache_enabled', value: 'true' }))
    expect(config.enabled).toBe(true)
  })

  it('returns enabled=false when value is 0', async () => {
    const config = await loadPromptCacheConfig(mockSupabase({ key: 'prompt_cache_enabled', value: 0 }))
    expect(config.enabled).toBe(false)
  })

  it('caches the config for 30s (no duplicate DB call)', async () => {
    const sb = mockSupabase({ key: 'prompt_cache_enabled', value: 1 })
    await loadPromptCacheConfig(sb)
    await loadPromptCacheConfig(sb)
    expect(sb.from).toHaveBeenCalledTimes(1)
  })

  it('invalidatePromptCacheConfig clears the in-memory cache', async () => {
    const sb = mockSupabase({ key: 'prompt_cache_enabled', value: 1 })
    await loadPromptCacheConfig(sb)
    invalidatePromptCacheConfig()
    await loadPromptCacheConfig(sb)
    expect(sb.from).toHaveBeenCalledTimes(2)
  })
})

describe('buildCachedSystemBlocks', () => {
  it('returns single text block when cache disabled (AC-1)', () => {
    const blocks = buildCachedSystemBlocks('static', 'dynamic', false)
    expect(blocks).toEqual([{ text: 'static\n\ndynamic' }])
  })

  it('returns single text block when staticPart is empty', () => {
    const blocks = buildCachedSystemBlocks('', 'dynamic', true)
    expect(blocks).toEqual([{ text: 'dynamic' }])
  })

  it('inserts cachePoint after static part when enabled (AC-2)', () => {
    const blocks = buildCachedSystemBlocks('static', 'dynamic', true)
    expect(blocks).toEqual([
      { text: 'static' },
      { cachePoint: { type: 'default' } },
      { text: 'dynamic' },
    ])
  })

  it('omits dynamic block when dynamicPart is empty', () => {
    const blocks = buildCachedSystemBlocks('static', '', true)
    expect(blocks).toEqual([
      { text: 'static' },
      { cachePoint: { type: 'default' } },
    ])
  })
})

describe('applyCacheToRequest / removeCacheMarkers / hasCacheMarkers', () => {
  it('applyCacheToRequest replaces system blocks', () => {
    const req = makeRequest()
    const cached = applyCacheToRequest(req, 'static', 'dynamic', true)
    expect(cached.system).toEqual([
      { text: 'static' },
      { cachePoint: { type: 'default' } },
      { text: 'dynamic' },
    ])
    expect(cached.messages).toBe(req.messages)
  })

  it('hasCacheMarkers detects cachePoint blocks', () => {
    const req = makeRequest([
      { text: 'static' },
      { cachePoint: { type: 'default' } },
      { text: 'dynamic' },
    ])
    expect(hasCacheMarkers(req)).toBe(true)
  })

  it('hasCacheMarkers returns false for plain blocks', () => {
    expect(hasCacheMarkers(makeRequest())).toBe(false)
  })

  it('removeCacheMarkers strips cachePoint blocks', () => {
    const req = makeRequest([
      { text: 'static' },
      { cachePoint: { type: 'default' } },
      { text: 'dynamic' },
    ])
    const cleaned = removeCacheMarkers(req)
    expect(cleaned.system).toEqual([{ text: 'static' }, { text: 'dynamic' }])
    expect(hasCacheMarkers(cleaned)).toBe(false)
  })
})

describe('callWithCacheFallback', () => {
  const chain = [{ modelId: 'claude-sonnet-4-6', priority: 1, fallback_model_id: null }]
  const nexusCfg = { endpoint: 'http://nexus', bearerToken: 'tok' }

  it('passes through when no cache markers (AC-1 off path)', async () => {
    const req = makeRequest()
    const fbResult = makeFallbackResult()
    mockCallWithFallback.mockResolvedValue(fbResult)

    const { result, cacheRejected } = await callWithCacheFallback(req, chain, nexusCfg, 'main')
    expect(result).toBe(fbResult)
    expect(cacheRejected).toBe(false)
    expect(mockCallWithFallback).toHaveBeenCalledTimes(1)
  })

  it('succeeds with cache markers on first try (AC-3)', async () => {
    const req = makeRequest([
      { text: 'static' },
      { cachePoint: { type: 'default' } },
      { text: 'dynamic' },
    ])
    const fbResult = makeFallbackResult({ cacheReadInputTokens: 80 })
    mockCallWithFallback.mockResolvedValue(fbResult)

    const { result, cacheRejected } = await callWithCacheFallback(req, chain, nexusCfg, 'main')
    expect(result.cacheReadInputTokens).toBe(80)
    expect(cacheRejected).toBe(false)
  })

  it('retries without cache markers on cache rejection (AC-4)', async () => {
    const req = makeRequest([
      { text: 'static' },
      { cachePoint: { type: 'default' } },
      { text: 'dynamic' },
    ])
    const retryResult = makeFallbackResult()
    mockCallWithFallback
      .mockRejectedValueOnce(new NexusError('Nexus 400: cache not supported', 400))
      .mockResolvedValueOnce(retryResult)

    const { result, cacheRejected } = await callWithCacheFallback(req, chain, nexusCfg, 'main')
    expect(cacheRejected).toBe(true)
    expect(result).toBe(retryResult)
    expect(mockCallWithFallback).toHaveBeenCalledTimes(2)

    const retryReq = mockCallWithFallback.mock.calls[1][0] as NexusRequest
    expect(retryReq.system.every(b => !('cachePoint' in b))).toBe(true)
  })

  it('throws non-cache errors through (AC-4 boundary)', async () => {
    const req = makeRequest([
      { text: 'static' },
      { cachePoint: { type: 'default' } },
    ])
    mockCallWithFallback.mockRejectedValue(new NexusError('Nexus 500: internal', 500))

    await expect(callWithCacheFallback(req, chain, nexusCfg, 'main')).rejects.toThrow('Nexus 500')
    expect(mockCallWithFallback).toHaveBeenCalledTimes(1)
  })

  it('does not retry on 400 without "cache" in message', async () => {
    const req = makeRequest([
      { text: 'static' },
      { cachePoint: { type: 'default' } },
    ])
    mockCallWithFallback.mockRejectedValue(new NexusError('Nexus 400: bad request', 400))

    await expect(callWithCacheFallback(req, chain, nexusCfg, 'main')).rejects.toThrow('bad request')
    expect(mockCallWithFallback).toHaveBeenCalledTimes(1)
  })
})

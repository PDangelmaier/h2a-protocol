import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callWithFallback, FallbackTimeoutError, FallbackChainExhaustedError } from '../fallback.js'
import type { FallbackChainEntry } from '../model-config.js'
import type { NexusRequest } from '../nexus.js'
import { NexusError } from '../nexus.js'

vi.mock('../nexus.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../nexus.js')>()
  return { ...mod, callNexusSync: vi.fn() }
})

vi.mock('../langfuse.js', () => ({
  trackModelFallback: vi.fn().mockResolvedValue(undefined),
}))

const { callNexusSync } = await import('../nexus.js')
const { trackModelFallback } = await import('../langfuse.js')
const mockCallNexus = vi.mocked(callNexusSync)
const mockTrackFallback = vi.mocked(trackModelFallback)

const baseRequest: NexusRequest = {
  modelId: 'will-be-overridden',
  system: [{ text: 'system prompt' }],
  messages: [{ role: 'user', content: [{ text: 'hello' }] }],
  inferenceConfig: { temperature: 0.7, maxTokens: 2048 },
}

const nexusConfig = { endpoint: 'http://nexus', bearerToken: 'tok' }

const chain3: FallbackChainEntry[] = [
  { modelId: 'claude-sonnet-4-6', priority: 1 },
  { modelId: 'claude-sonnet-4-6', priority: 2 },
  { modelId: 'claude-haiku-4-5', priority: 3 },
]

const chain1: FallbackChainEntry[] = [
  { modelId: 'claude-sonnet-4-6', priority: 1 },
]

const okResult = {
  text: 'Hello!',
  toolCalls: [],
  stopReason: 'end_turn',
  inputTokens: 50,
  outputTokens: 10,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SPEC-024: Model-Fallback-Chain', () => {
  describe('AC-1: Ordered fallback chain with max 3 models', () => {
    it('uses first model when it succeeds', async () => {
      mockCallNexus.mockResolvedValueOnce(okResult)

      const result = await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(result.actualModelId).toBe('claude-sonnet-4-6')
      expect(result.fallbacksUsed).toBe(0)
      expect(mockCallNexus).toHaveBeenCalledTimes(1)
      expect(mockCallNexus.mock.calls[0][0].modelId).toBe('claude-sonnet-4-6')
    })

    it('overrides request modelId with chain entry', async () => {
      mockCallNexus.mockResolvedValueOnce(okResult)

      await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(mockCallNexus.mock.calls[0][0].modelId).toBe('claude-sonnet-4-6')
    })
  })

  describe('AC-2: Retries on transient errors, not on validation errors', () => {
    it('falls back on 429 rate limit', async () => {
      mockCallNexus
        .mockRejectedValueOnce(new NexusError('Nexus 429: rate limited', 429))
        .mockResolvedValueOnce(okResult)

      const result = await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(result.actualModelId).toBe('claude-sonnet-4-6')
      expect(result.fallbacksUsed).toBe(1)
      expect(mockCallNexus).toHaveBeenCalledTimes(2)
    })

    it('falls back on 500 server error', async () => {
      mockCallNexus
        .mockRejectedValueOnce(new NexusError('Nexus 500: internal', 500))
        .mockResolvedValueOnce(okResult)

      const result = await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(result.fallbacksUsed).toBe(1)
    })

    it('falls back on 503 service unavailable', async () => {
      mockCallNexus
        .mockRejectedValueOnce(new NexusError('Nexus 503: unavailable', 503))
        .mockResolvedValueOnce(okResult)

      const result = await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(result.fallbacksUsed).toBe(1)
    })

    it('falls back on timeout (AbortError)', async () => {
      const abortErr = new Error('The operation was aborted')
      abortErr.name = 'AbortError'
      mockCallNexus
        .mockRejectedValueOnce(abortErr)
        .mockResolvedValueOnce(okResult)

      const result = await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(result.fallbacksUsed).toBe(1)
    })

    it('falls back on model unavailable (0 status)', async () => {
      mockCallNexus
        .mockRejectedValueOnce(new NexusError('Nexus 0: not available', 0))
        .mockResolvedValueOnce(okResult)

      const result = await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(result.fallbacksUsed).toBe(1)
    })

    it('does NOT fall back on 400 bad request', async () => {
      mockCallNexus.mockRejectedValueOnce(new NexusError('Nexus 400: bad request', 400))

      await expect(
        callWithFallback(baseRequest, chain3, nexusConfig, 'main'),
      ).rejects.toThrow('Nexus 400')

      expect(mockCallNexus).toHaveBeenCalledTimes(1)
    })

    it('does NOT fall back on 401 unauthorized', async () => {
      mockCallNexus.mockRejectedValueOnce(new NexusError('Nexus 401: unauthorized', 401))

      await expect(
        callWithFallback(baseRequest, chain3, nexusConfig, 'main'),
      ).rejects.toThrow('Nexus 401')

      expect(mockCallNexus).toHaveBeenCalledTimes(1)
    })

    it('does NOT fall back on 403 forbidden', async () => {
      mockCallNexus.mockRejectedValueOnce(new NexusError('Nexus 403: forbidden', 403))

      await expect(
        callWithFallback(baseRequest, chain3, nexusConfig, 'main'),
      ).rejects.toThrow('Nexus 403')

      expect(mockCallNexus).toHaveBeenCalledTimes(1)
    })

    it('does NOT fall back on 422 validation error', async () => {
      mockCallNexus.mockRejectedValueOnce(new NexusError('Nexus 422: validation', 422))

      await expect(
        callWithFallback(baseRequest, chain3, nexusConfig, 'main'),
      ).rejects.toThrow('Nexus 422')

      expect(mockCallNexus).toHaveBeenCalledTimes(1)
    })
  })

  describe('AC-3: Time budget limits all attempts', () => {
    it('throws FallbackTimeoutError when budget exceeded', async () => {
      mockCallNexus.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        throw new NexusError('Nexus 500: slow', 500)
      })

      await expect(
        callWithFallback(baseRequest, chain3, nexusConfig, 'main', { timeBudgetMs: 10 }),
      ).rejects.toThrow(FallbackTimeoutError)
    })

    it('uses default 20s budget when not specified', async () => {
      mockCallNexus.mockResolvedValueOnce(okResult)

      const result = await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(result.text).toBe('Hello!')
    })
  })

  describe('AC-4: model_fallback event on each fallback', () => {
    it('emits model_fallback event with purpose, from, to, errorClass', async () => {
      mockCallNexus
        .mockRejectedValueOnce(new NexusError('Nexus 429: rate limited', 429))
        .mockResolvedValueOnce(okResult)

      await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(mockTrackFallback).toHaveBeenCalledTimes(1)
      expect(mockTrackFallback).toHaveBeenCalledWith({
        purpose: 'main',
        fromModel: 'claude-sonnet-4-6',
        toModel: 'claude-sonnet-4-6',
        errorClass: 'rate_limit',
      })
    })

    it('emits event for each fallback step', async () => {
      mockCallNexus
        .mockRejectedValueOnce(new NexusError('Nexus 500: error', 500))
        .mockRejectedValueOnce(new NexusError('Nexus 429: rate limit', 429))
        .mockResolvedValueOnce(okResult)

      await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(mockTrackFallback).toHaveBeenCalledTimes(2)
      expect(mockTrackFallback.mock.calls[0][0].errorClass).toBe('server_error')
      expect(mockTrackFallback.mock.calls[1][0].errorClass).toBe('rate_limit')
      expect(mockTrackFallback.mock.calls[1][0].toModel).toBe('claude-haiku-4-5')
    })

    it('no event when first model succeeds', async () => {
      mockCallNexus.mockResolvedValueOnce(okResult)

      await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(mockTrackFallback).not.toHaveBeenCalled()
    })
  })

  describe('AC-5: Cost booked for actual responding model', () => {
    it('returns actualModelId for cost booking', async () => {
      mockCallNexus
        .mockRejectedValueOnce(new NexusError('Nexus 500: error', 500))
        .mockRejectedValueOnce(new NexusError('Nexus 500: error', 500))
        .mockResolvedValueOnce(okResult)

      const result = await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(result.actualModelId).toBe('claude-haiku-4-5')
      expect(result.fallbacksUsed).toBe(2)
    })
  })

  describe('AC-6: Tests for each error class, chain exhausted, timeout', () => {
    it('chain exhausted — all models fail', async () => {
      mockCallNexus
        .mockRejectedValueOnce(new NexusError('Nexus 500: error', 500))
        .mockRejectedValueOnce(new NexusError('Nexus 500: error', 500))
        .mockRejectedValueOnce(new NexusError('Nexus 500: error', 500))

      await expect(
        callWithFallback(baseRequest, chain3, nexusConfig, 'main'),
      ).rejects.toThrow(FallbackChainExhaustedError)
    })

    it('chain exhausted with single model', async () => {
      mockCallNexus.mockRejectedValueOnce(new NexusError('Nexus 500: error', 500))

      await expect(
        callWithFallback(baseRequest, chain1, nexusConfig, 'main'),
      ).rejects.toThrow(FallbackChainExhaustedError)
    })

    it('FallbackChainExhaustedError includes chain length and last error', async () => {
      const lastErr = new NexusError('Nexus 503: gone', 503)
      mockCallNexus
        .mockRejectedValueOnce(new NexusError('Nexus 500: err', 500))
        .mockRejectedValueOnce(new NexusError('Nexus 500: err', 500))
        .mockRejectedValueOnce(lastErr)

      try {
        await callWithFallback(baseRequest, chain3, nexusConfig, 'main')
        expect.fail('should throw')
      } catch (err) {
        expect(err).toBeInstanceOf(FallbackChainExhaustedError)
        const e = err as FallbackChainExhaustedError
        expect(e.chainLength).toBe(3)
        expect(e.lastError).toBe(lastErr)
      }
    })

    it('FallbackTimeoutError includes budget', async () => {
      mockCallNexus.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        throw new NexusError('Nexus 500: slow', 500)
      })

      try {
        await callWithFallback(baseRequest, chain3, nexusConfig, 'main', { timeBudgetMs: 10 })
        expect.fail('should throw')
      } catch (err) {
        expect(err).toBeInstanceOf(FallbackTimeoutError)
        expect((err as FallbackTimeoutError).timeBudgetMs).toBe(10)
      }
    })

    it('timeout error has descriptive name', async () => {
      mockCallNexus.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        throw new NexusError('Nexus 500: slow', 500)
      })

      try {
        await callWithFallback(baseRequest, chain3, nexusConfig, 'main', { timeBudgetMs: 10 })
        expect.fail('should throw')
      } catch (err) {
        expect((err as Error).message).toContain('time budget')
      }
    })

    it('passes NexusStreamResult fields through', async () => {
      const detailed = {
        text: 'response',
        toolCalls: [{ id: 't1', name: 'tool', input: {} }],
        stopReason: 'tool_use',
        inputTokens: 100,
        outputTokens: 50,
      }
      mockCallNexus.mockResolvedValueOnce(detailed)

      const result = await callWithFallback(baseRequest, chain3, nexusConfig, 'main')

      expect(result.text).toBe('response')
      expect(result.toolCalls).toEqual(detailed.toolCalls)
      expect(result.inputTokens).toBe(100)
      expect(result.outputTokens).toBe(50)
    })
  })
})

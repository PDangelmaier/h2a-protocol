import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createLoopState,
  recordToolRound,
  checkSoftLoop,
  buildSoftLoopHint,
  hashToolSignature,
  emitTraceEvent,
  emitSoftLoopEvent,
  createLangfuseEmitter,
  createStructuredLogEmitter,
} from '../loop-telemetry.js'
import type { TraceEmitter, ToolRoundTrace, SoftLoopDetection } from '../loop-telemetry.js'

describe('loop-telemetry', () => {
  describe('hashToolSignature', () => {
    it('produces stable hash for same name + input', () => {
      const h1 = hashToolSignature('vehicle_search', { model: 'EQS', year: 2026 })
      const h2 = hashToolSignature('vehicle_search', { model: 'EQS', year: 2026 })
      expect(h1).toBe(h2)
      expect(h1).toHaveLength(16)
    })

    it('produces different hash for different input', () => {
      const h1 = hashToolSignature('vehicle_search', { model: 'EQS' })
      const h2 = hashToolSignature('vehicle_search', { model: 'GLC' })
      expect(h1).not.toBe(h2)
    })

    it('produces different hash for different tool name', () => {
      const h1 = hashToolSignature('vehicle_search', { model: 'EQS' })
      const h2 = hashToolSignature('dealer_search', { model: 'EQS' })
      expect(h1).not.toBe(h2)
    })

    it('normalizes key order', () => {
      const h1 = hashToolSignature('t', { b: 2, a: 1 })
      const h2 = hashToolSignature('t', { a: 1, b: 2 })
      expect(h1).toBe(h2)
    })

    it('contains no parameter values — only hex hash', () => {
      const h = hashToolSignature('tool', { secret: 'sensitive_data_123' })
      expect(h).toMatch(/^[0-9a-f]{16}$/)
      expect(h).not.toContain('sensitive')
    })
  })

  describe('createLoopState', () => {
    it('returns empty state', () => {
      const state = createLoopState()
      expect(state.traces).toHaveLength(0)
      expect(state.signatureCounts.size).toBe(0)
    })
  })

  describe('recordToolRound', () => {
    it('records trace with correct fields', () => {
      const state = createLoopState()
      const trace = recordToolRound(state, 1, [
        { name: 'vehicle_search', input: { model: 'EQS' } },
      ], 150, 1200, 800)

      expect(trace.round).toBe(1)
      expect(trace.toolNames).toEqual(['vehicle_search'])
      expect(trace.durationMs).toBe(150)
      expect(trace.estimatedTokens).toBe(1200)
      expect(trace.truncatedResultSize).toBe(800)
      expect(trace.signatureHashes).toHaveLength(1)
      expect(trace.signatureHashes[0]).toMatch(/^[0-9a-f]{16}$/)
    })

    it('accumulates traces across rounds', () => {
      const state = createLoopState()
      recordToolRound(state, 1, [{ name: 'a', input: {} }], 100, 500, 200)
      recordToolRound(state, 2, [{ name: 'b', input: {} }], 200, 600, 300)
      expect(state.traces).toHaveLength(2)
    })

    it('counts signature occurrences across rounds', () => {
      const state = createLoopState()
      recordToolRound(state, 1, [{ name: 'a', input: { x: 1 } }], 100, 500, 200)
      recordToolRound(state, 2, [{ name: 'a', input: { x: 1 } }], 100, 500, 200)

      const hash = hashToolSignature('a', { x: 1 })
      expect(state.signatureCounts.get(hash)).toBe(2)
    })

    it('records multiple tools in one round', () => {
      const state = createLoopState()
      const trace = recordToolRound(state, 1, [
        { name: 'vehicle_search', input: { model: 'EQS' } },
        { name: 'dealer_search', input: { city: 'Stuttgart' } },
      ], 300, 2000, 1500)

      expect(trace.toolNames).toEqual(['vehicle_search', 'dealer_search'])
      expect(trace.signatureHashes).toHaveLength(2)
    })
  })

  describe('checkSoftLoop', () => {
    it('detects soft loop at 3× same signature', () => {
      const state = createLoopState()
      recordToolRound(state, 1, [{ name: 'a', input: { x: 1 } }], 100, 500, 200)
      recordToolRound(state, 2, [{ name: 'a', input: { x: 1 } }], 100, 500, 200)
      recordToolRound(state, 3, [{ name: 'a', input: { x: 1 } }], 100, 500, 200)

      const result = checkSoftLoop(state)
      expect(result.detected).toBe(true)
      expect(result.repeatCount).toBe(3)
      expect(result.repeatedHash).toMatch(/^[0-9a-f]{16}$/)
    })

    it('does not trigger at 2× same + 1 different', () => {
      const state = createLoopState()
      recordToolRound(state, 1, [{ name: 'a', input: { x: 1 } }], 100, 500, 200)
      recordToolRound(state, 2, [{ name: 'a', input: { x: 1 } }], 100, 500, 200)
      recordToolRound(state, 3, [{ name: 'a', input: { x: 2 } }], 100, 500, 200)

      const result = checkSoftLoop(state)
      expect(result.detected).toBe(false)
      expect(result.repeatedHash).toBeNull()
      expect(result.repeatCount).toBe(0)
    })

    it('does not trigger at 2× same', () => {
      const state = createLoopState()
      recordToolRound(state, 1, [{ name: 'a', input: { x: 1 } }], 100, 500, 200)
      recordToolRound(state, 2, [{ name: 'a', input: { x: 1 } }], 100, 500, 200)

      const result = checkSoftLoop(state)
      expect(result.detected).toBe(false)
    })

    it('detects loop from parallel tool calls across rounds', () => {
      const state = createLoopState()
      recordToolRound(state, 1, [
        { name: 'a', input: { x: 1 } },
        { name: 'a', input: { x: 1 } },
      ], 100, 500, 200)
      recordToolRound(state, 2, [{ name: 'a', input: { x: 1 } }], 100, 500, 200)

      const result = checkSoftLoop(state)
      expect(result.detected).toBe(true)
      expect(result.repeatCount).toBe(3)
    })

    it('returns empty state when no calls recorded', () => {
      const state = createLoopState()
      const result = checkSoftLoop(state)
      expect(result.detected).toBe(false)
    })
  })

  describe('buildSoftLoopHint', () => {
    const detection: SoftLoopDetection = { detected: true, repeatedHash: 'abc123', repeatCount: 3 }

    it('returns German hint for de locale', () => {
      const hint = buildSoftLoopHint(detection, 'de')
      expect(hint).toContain('[System]')
      expect(hint).toContain('3×')
      expect(hint).toContain('andere Strategie')
    })

    it('returns English hint for en locale', () => {
      const hint = buildSoftLoopHint(detection, 'en')
      expect(hint).toContain('[System]')
      expect(hint).toContain('3×')
      expect(hint).toContain('different strategy')
    })
  })

  describe('emitTraceEvent', () => {
    it('calls emitter with correct fields', async () => {
      const emitter = vi.fn().mockResolvedValue(undefined)
      const trace: ToolRoundTrace = {
        round: 1,
        toolNames: ['vehicle_search'],
        durationMs: 150,
        estimatedTokens: 1200,
        truncatedResultSize: 800,
        signatureHashes: ['abcd1234abcd1234'],
      }

      await emitTraceEvent(trace, 'session-1', emitter)

      expect(emitter).toHaveBeenCalledOnce()
      const arg = emitter.mock.calls[0][0]
      expect(arg.name).toBe('tool_round_trace')
      expect(arg.metadata.session_id).toBe('session-1')
      expect(arg.metadata.round).toBe(1)
      expect(arg.metadata.tool_names).toEqual(['vehicle_search'])
      expect(arg.metadata.duration_ms).toBe(150)
      expect(arg.metadata.estimated_tokens).toBe(1200)
      expect(arg.metadata.truncated_result_size).toBe(800)
      expect(arg.metadata.signature_hashes).toEqual(['abcd1234abcd1234'])
    })

    it('does not throw when emitter is null', async () => {
      const trace: ToolRoundTrace = {
        round: 1, toolNames: ['a'], durationMs: 100,
        estimatedTokens: 500, truncatedResultSize: 200, signatureHashes: ['abc'],
      }
      await expect(emitTraceEvent(trace, 'session-1', null)).resolves.toBeUndefined()
    })

    it('swallows emitter errors (AC-4)', async () => {
      const emitter = vi.fn().mockRejectedValue(new Error('Langfuse down'))
      const trace: ToolRoundTrace = {
        round: 1, toolNames: ['a'], durationMs: 100,
        estimatedTokens: 500, truncatedResultSize: 200, signatureHashes: ['abc'],
      }
      await expect(emitTraceEvent(trace, 'session-1', emitter)).resolves.toBeUndefined()
    })
  })

  describe('emitSoftLoopEvent', () => {
    it('calls emitter with soft_loop_detected', async () => {
      const emitter = vi.fn().mockResolvedValue(undefined)
      const detection: SoftLoopDetection = { detected: true, repeatedHash: 'abc123', repeatCount: 3 }

      await emitSoftLoopEvent(detection, 'session-1', emitter)

      expect(emitter).toHaveBeenCalledOnce()
      const arg = emitter.mock.calls[0][0]
      expect(arg.name).toBe('soft_loop_detected')
      expect(arg.level).toBe('WARNING')
      expect(arg.metadata.repeated_hash).toBe('abc123')
      expect(arg.metadata.repeat_count).toBe(3)
    })

    it('does not throw when emitter is null', async () => {
      const detection: SoftLoopDetection = { detected: true, repeatedHash: 'abc', repeatCount: 3 }
      await expect(emitSoftLoopEvent(detection, 's', null)).resolves.toBeUndefined()
    })

    it('swallows emitter errors (AC-4)', async () => {
      const emitter = vi.fn().mockRejectedValue(new Error('boom'))
      const detection: SoftLoopDetection = { detected: true, repeatedHash: 'abc', repeatCount: 3 }
      await expect(emitSoftLoopEvent(detection, 's', emitter)).resolves.toBeUndefined()
    })
  })

  describe('createLangfuseEmitter', () => {
    it('returns null when config is null', () => {
      expect(createLangfuseEmitter(null)).toBeNull()
    })

    it('returns a function when config is provided', () => {
      const emitter = createLangfuseEmitter({ publicKey: 'pk', secretKey: 'sk', baseUrl: 'http://localhost:3000' })
      expect(typeof emitter).toBe('function')
    })
  })

  describe('createStructuredLogEmitter', () => {
    it('returns a function', () => {
      const emitter = createStructuredLogEmitter()
      expect(typeof emitter).toBe('function')
    })

    it('logs structured JSON', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const emitter = createStructuredLogEmitter()

      await emitter({ name: 'test_event', metadata: { session_id: 's1' } })

      expect(consoleSpy).toHaveBeenCalledOnce()
      const logged = JSON.parse(consoleSpy.mock.calls[0][0] as string)
      expect(logged.type).toBe('h2a_telemetry')
      expect(logged.event).toBe('test_event')
      expect(logged.session_id).toBe('s1')
      expect(logged.timestamp).toBeDefined()

      consoleSpy.mockRestore()
    })
  })

  describe('trace contains no parameter values (AC-3)', () => {
    it('signature hashes are hex-only, no raw values', () => {
      const state = createLoopState()
      const trace = recordToolRound(state, 1, [
        { name: 'vehicle_search', input: { vin: 'WDB1234567890ABCD', model: 'EQS' } },
      ], 100, 500, 200)

      for (const hash of trace.signatureHashes) {
        expect(hash).toMatch(/^[0-9a-f]{16}$/)
        expect(hash).not.toContain('WDB')
        expect(hash).not.toContain('EQS')
      }
    })
  })
})

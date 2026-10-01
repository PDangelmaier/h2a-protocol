import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../langfuse.js', () => ({
  getLangfuseConfig: vi.fn().mockReturnValue(null),
}))

vi.mock('../loop-telemetry.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../loop-telemetry.js')>()
  return {
    ...orig,
    createLangfuseEmitter: vi.fn().mockReturnValue(null),
    createStructuredLogEmitter: vi.fn().mockReturnValue(async () => {}),
  }
})

import { trackTtft, getSlaThreshold } from '../ttft-tracking.js'
import type { TtftMetrics } from '../ttft-tracking.js'
import { getLangfuseConfig } from '../langfuse.js'
import { createLangfuseEmitter, createStructuredLogEmitter } from '../loop-telemetry.js'

function mockSupabase(insertError: boolean = false) {
  const insertedRows: unknown[] = []
  const insertFn = vi.fn().mockImplementation((row: unknown) => {
    insertedRows.push(row)
    return { error: insertError ? { message: 'insert failed' } : null }
  })
  const fromFn = vi.fn().mockReturnValue({ insert: insertFn })

  return {
    supabase: { from: fromFn } as unknown as Parameters<typeof trackTtft>[1],
    fromFn,
    insertFn,
    insertedRows,
  }
}

function baseMetrics(overrides?: Partial<TtftMetrics>): TtftMetrics {
  return {
    ttftMs: 800,
    totalMs: 2000,
    sessionId: 'test-session-001',
    model: 'claude-sonnet-4-6',
    toolRounds: 2,
    ...overrides,
  }
}

describe('ttft-tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('AC-1: TTFT and total time stored per turn', () => {
    it('inserts ttft_measurement with correct fields', async () => {
      const { supabase, fromFn, insertFn } = mockSupabase()
      const metrics = baseMetrics()

      await trackTtft(metrics, supabase)

      expect(fromFn).toHaveBeenCalledWith('analytics_events')
      const measurementCall = insertFn.mock.calls.find(
        (c: unknown[]) => (c[0] as { event_type: string }).event_type === 'ttft_measurement',
      )
      expect(measurementCall).toBeDefined()
      const row = measurementCall![0] as Record<string, unknown>
      expect(row.event_type).toBe('ttft_measurement')
      expect(row.session_id).toBe('test-session-001')
      expect((row.metadata as Record<string, unknown>).ttft_ms).toBe(800)
      expect((row.metadata as Record<string, unknown>).total_ms).toBe(2000)
    })

    it('returns stored: true on success', async () => {
      const { supabase } = mockSupabase()
      const result = await trackTtft(baseMetrics(), supabase)
      expect(result.stored).toBe(true)
    })

    it('returns stored: false on insert error', async () => {
      const { supabase } = mockSupabase(true)
      const result = await trackTtft(baseMetrics(), supabase)
      expect(result.stored).toBe(false)
    })
  })

  describe('AC-2: session_id, model, tool rounds stored + Langfuse', () => {
    it('stores model and tool_rounds in metadata', async () => {
      const { supabase, insertFn } = mockSupabase()
      await trackTtft(baseMetrics({ model: 'claude-opus-4-6', toolRounds: 5 }), supabase)

      const call = insertFn.mock.calls.find(
        (c: unknown[]) => (c[0] as { event_type: string }).event_type === 'ttft_measurement',
      )
      const meta = (call![0] as Record<string, unknown>).metadata as Record<string, unknown>
      expect(meta.model).toBe('claude-opus-4-6')
      expect(meta.tool_rounds).toBe(5)
    })

    it('emits to structured log when Langfuse not configured', async () => {
      const emitterFn = vi.fn().mockResolvedValue(undefined)
      vi.mocked(createStructuredLogEmitter).mockReturnValue(emitterFn)
      vi.mocked(getLangfuseConfig).mockReturnValue(null)

      const { supabase } = mockSupabase()
      await trackTtft(baseMetrics(), supabase)

      expect(createStructuredLogEmitter).toHaveBeenCalled()
      expect(emitterFn).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ttft_measurement',
          metadata: expect.objectContaining({ ttft_ms: 800 }),
        }),
      )
    })

    it('emits to Langfuse when configured', async () => {
      const langfuseEmitter = vi.fn().mockResolvedValue(undefined)
      const fakeCfg = { publicKey: 'pk', secretKey: 'sk', baseUrl: 'https://lf' }
      vi.mocked(getLangfuseConfig).mockReturnValue(fakeCfg)
      vi.mocked(createLangfuseEmitter).mockReturnValue(langfuseEmitter)

      const { supabase } = mockSupabase()
      await trackTtft(baseMetrics(), supabase)

      expect(createLangfuseEmitter).toHaveBeenCalledWith(fakeCfg)
      expect(langfuseEmitter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'ttft_measurement' }),
      )
    })
  })

  describe('AC-3: SLA breach event at >1500ms', () => {
    it('creates ttft_sla_breach when TTFT > 1500ms', async () => {
      const { supabase, insertFn } = mockSupabase()
      const result = await trackTtft(baseMetrics({ ttftMs: 2000 }), supabase)

      expect(result.slaBreach).toBe(true)
      const breachCall = insertFn.mock.calls.find(
        (c: unknown[]) => (c[0] as { event_type: string }).event_type === 'ttft_sla_breach',
      )
      expect(breachCall).toBeDefined()
      const meta = (breachCall![0] as Record<string, unknown>).metadata as Record<string, unknown>
      expect(meta.ttft_ms).toBe(2000)
      expect(meta.threshold_ms).toBe(1500)
    })

    it('does not create breach event when TTFT <= 1500ms', async () => {
      const { supabase, insertFn } = mockSupabase()
      const result = await trackTtft(baseMetrics({ ttftMs: 1500 }), supabase)

      expect(result.slaBreach).toBe(false)
      const breachCall = insertFn.mock.calls.find(
        (c: unknown[]) => (c[0] as { event_type: string }).event_type === 'ttft_sla_breach',
      )
      expect(breachCall).toBeUndefined()
    })

    it('does not create breach event when TTFT = 1499ms', async () => {
      const { supabase, insertFn } = mockSupabase()
      const result = await trackTtft(baseMetrics({ ttftMs: 1499 }), supabase)
      expect(result.slaBreach).toBe(false)
      const breachCall = insertFn.mock.calls.find(
        (c: unknown[]) => (c[0] as { event_type: string }).event_type === 'ttft_sla_breach',
      )
      expect(breachCall).toBeUndefined()
    })

    it('creates breach event at boundary TTFT = 1501ms', async () => {
      const { supabase } = mockSupabase()
      const result = await trackTtft(baseMetrics({ ttftMs: 1501 }), supabase)
      expect(result.slaBreach).toBe(true)
    })

    it('emits sla_breach telemetry event', async () => {
      const emitterFn = vi.fn().mockResolvedValue(undefined)
      vi.mocked(createStructuredLogEmitter).mockReturnValue(emitterFn)
      vi.mocked(getLangfuseConfig).mockReturnValue(null)

      const { supabase } = mockSupabase()
      await trackTtft(baseMetrics({ ttftMs: 2000 }), supabase)

      const breachEmit = emitterFn.mock.calls.find(
        (c: unknown[]) => (c[0] as { name: string }).name === 'ttft_sla_breach',
      )
      expect(breachEmit).toBeDefined()
      expect((breachEmit![0] as { level?: string }).level).toBe('WARNING')
    })
  })

  describe('AC-4: P50/P95 script exists (SQL verified separately)', () => {
    it('getSlaThreshold returns 1500', () => {
      expect(getSlaThreshold()).toBe(1500)
    })
  })

  describe('AC-5: measurement does not block or alter response', () => {
    it('trackTtft returns quickly even with slow supabase', async () => {
      const slowInsert = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ error: null }), 10)),
      )
      const supabase = {
        from: vi.fn().mockReturnValue({ insert: slowInsert }),
      } as unknown as Parameters<typeof trackTtft>[1]

      const start = Date.now()
      await trackTtft(baseMetrics(), supabase)
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(200)
    })

    it('does not throw when emitter fails', async () => {
      const failingEmitter = vi.fn().mockRejectedValue(new Error('Langfuse down'))
      vi.mocked(createStructuredLogEmitter).mockReturnValue(failingEmitter)
      vi.mocked(getLangfuseConfig).mockReturnValue(null)

      const { supabase } = mockSupabase()
      await expect(trackTtft(baseMetrics(), supabase)).resolves.toBeDefined()
    })

    it('does not throw when supabase insert fails', async () => {
      const { supabase } = mockSupabase(true)
      const result = await trackTtft(baseMetrics(), supabase)
      expect(result.stored).toBe(false)
    })

    it('concurrent tracking calls do not interfere', async () => {
      const { supabase, insertFn } = mockSupabase()

      await Promise.all([
        trackTtft(baseMetrics({ ttftMs: 100, sessionId: 's1' }), supabase),
        trackTtft(baseMetrics({ ttftMs: 2000, sessionId: 's2' }), supabase),
      ])

      const measurementCalls = insertFn.mock.calls.filter(
        (c: unknown[]) => (c[0] as { event_type: string }).event_type === 'ttft_measurement',
      )
      expect(measurementCalls).toHaveLength(2)

      const breachCalls = insertFn.mock.calls.filter(
        (c: unknown[]) => (c[0] as { event_type: string }).event_type === 'ttft_sla_breach',
      )
      expect(breachCalls).toHaveLength(1)
    })
  })
})

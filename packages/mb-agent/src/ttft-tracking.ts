import type { SupabaseClient } from '@supabase/supabase-js'
import { getLangfuseConfig } from './langfuse.js'
import { createLangfuseEmitter, createStructuredLogEmitter } from './loop-telemetry.js'
import type { TraceEmitter } from './loop-telemetry.js'

const SLA_THRESHOLD_MS = 1500

export interface TtftMetrics {
  ttftMs: number
  totalMs: number
  sessionId: string
  model: string
  toolRounds: number
}

export interface TtftTrackResult {
  stored: boolean
  slaBreach: boolean
}

export async function trackTtft(
  metrics: TtftMetrics,
  supabase: SupabaseClient,
): Promise<TtftTrackResult> {
  const slaBreach = metrics.ttftMs > SLA_THRESHOLD_MS

  const insertPromise = supabase.from('analytics_events').insert({
    event_type: 'ttft_measurement',
    session_id: metrics.sessionId,
    metadata: {
      ttft_ms: metrics.ttftMs,
      total_ms: metrics.totalMs,
      model: metrics.model,
      tool_rounds: metrics.toolRounds,
    },
  })

  const breachPromise = slaBreach
    ? supabase.from('analytics_events').insert({
        event_type: 'ttft_sla_breach',
        session_id: metrics.sessionId,
        metadata: {
          ttft_ms: metrics.ttftMs,
          threshold_ms: SLA_THRESHOLD_MS,
          model: metrics.model,
          tool_rounds: metrics.toolRounds,
        },
      })
    : Promise.resolve(null)

  const emitPromise = emitTtftTelemetry(metrics, slaBreach)

  const [insertResult] = await Promise.all([insertPromise, breachPromise, emitPromise])

  return {
    stored: !insertResult.error,
    slaBreach,
  }
}

async function emitTtftTelemetry(metrics: TtftMetrics, slaBreach: boolean): Promise<void> {
  const langfuseCfg = getLangfuseConfig()
  const emitter: TraceEmitter | null = langfuseCfg
    ? createLangfuseEmitter(langfuseCfg)
    : createStructuredLogEmitter()

  if (!emitter) return

  try {
    await emitter({
      name: 'ttft_measurement',
      metadata: {
        session_id: metrics.sessionId,
        ttft_ms: metrics.ttftMs,
        total_ms: metrics.totalMs,
        model: metrics.model,
        tool_rounds: metrics.toolRounds,
      },
    })
  } catch {
    // fire-and-forget (E-028)
  }

  if (slaBreach) {
    try {
      await emitter({
        name: 'ttft_sla_breach',
        level: 'WARNING',
        metadata: {
          session_id: metrics.sessionId,
          ttft_ms: metrics.ttftMs,
          threshold_ms: SLA_THRESHOLD_MS,
          model: metrics.model,
        },
      })
    } catch {
      // fire-and-forget (E-028)
    }
  }
}

export function getSlaThreshold(): number {
  return SLA_THRESHOLD_MS
}

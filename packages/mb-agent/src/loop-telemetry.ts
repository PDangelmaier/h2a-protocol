export interface ToolRoundTrace {
  round: number
  toolNames: string[]
  durationMs: number
  estimatedTokens: number
  truncatedResultSize: number
  signatureHashes: string[]
}

export interface SoftLoopDetection {
  detected: boolean
  repeatedHash: string | null
  repeatCount: number
}

export interface LoopTelemetryState {
  traces: ToolRoundTrace[]
  signatureCounts: Map<string, number>
}

const SOFT_LOOP_THRESHOLD = 3

export function createLoopState(): LoopTelemetryState {
  return { traces: [], signatureCounts: new Map() }
}

function deepSortKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(deepSortKeys)
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = deepSortKeys((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

export function hashToolSignature(toolName: string, input: unknown): string {
  const normalized = JSON.stringify(deepSortKeys(input))
  const str = `${toolName}:${normalized}`
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

export function recordToolRound(
  state: LoopTelemetryState,
  round: number,
  toolCalls: Array<{ name: string; input: unknown }>,
  durationMs: number,
  estimatedTokens: number,
  truncatedResultSize: number,
): ToolRoundTrace {
  const signatureHashes = toolCalls.map(tc => hashToolSignature(tc.name, tc.input))

  for (const hash of signatureHashes) {
    state.signatureCounts.set(hash, (state.signatureCounts.get(hash) ?? 0) + 1)
  }

  const trace: ToolRoundTrace = {
    round,
    toolNames: toolCalls.map(tc => tc.name),
    durationMs,
    estimatedTokens,
    truncatedResultSize,
    signatureHashes,
  }

  state.traces.push(trace)
  return trace
}

export function checkSoftLoop(state: LoopTelemetryState): SoftLoopDetection {
  for (const [hash, count] of state.signatureCounts) {
    if (count >= SOFT_LOOP_THRESHOLD) {
      return { detected: true, repeatedHash: hash, repeatCount: count }
    }
  }
  return { detected: false, repeatedHash: null, repeatCount: 0 }
}

export function buildSoftLoopHint(detection: SoftLoopDetection, locale: string): string {
  if (locale.startsWith('de')) {
    return `[System] Wiederholte Tool-Nutzung erkannt (${detection.repeatCount}× identischer Aufruf). Bitte wählen Sie eine andere Strategie oder antworten Sie dem Kunden direkt.`
  }
  return `[System] Repeated tool usage detected (${detection.repeatCount}× identical call). Please choose a different strategy or respond to the customer directly.`
}

export async function emitTraceEvent(
  trace: ToolRoundTrace,
  sessionId: string,
  emitter: TraceEmitter | null,
): Promise<void> {
  if (!emitter) return
  try {
    await emitter({
      name: 'tool_round_trace',
      metadata: {
        session_id: sessionId,
        round: trace.round,
        tool_names: trace.toolNames,
        duration_ms: trace.durationMs,
        estimated_tokens: trace.estimatedTokens,
        truncated_result_size: trace.truncatedResultSize,
        signature_hashes: trace.signatureHashes,
      },
    })
  } catch {
    // AC-4: telemetry errors must not break turns
  }
}

export async function emitSoftLoopEvent(
  detection: SoftLoopDetection,
  sessionId: string,
  emitter: TraceEmitter | null,
): Promise<void> {
  if (!emitter) return
  try {
    await emitter({
      name: 'soft_loop_detected',
      level: 'WARNING',
      metadata: {
        session_id: sessionId,
        repeated_hash: detection.repeatedHash,
        repeat_count: detection.repeatCount,
      },
    })
  } catch {
    // AC-4: telemetry errors must not break turns
  }
}

export type TraceEmitter = (event: {
  name: string
  level?: string
  metadata: Record<string, unknown>
}) => Promise<void>

export function createLangfuseEmitter(config: { publicKey: string; secretKey: string; baseUrl: string } | null): TraceEmitter | null {
  if (!config) return null

  return async (event) => {
    const auth = btoa(`${config.publicKey}:${config.secretKey}`)
    await fetch(`${config.baseUrl}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        batch: [{
          id: crypto.randomUUID(),
          type: 'event-create',
          timestamp: new Date().toISOString(),
          body: { name: event.name, level: event.level, metadata: event.metadata },
        }],
      }),
    })
  }
}

export function createStructuredLogEmitter(): TraceEmitter {
  return async (event) => {
    console.log(JSON.stringify({
      type: 'h2a_telemetry',
      event: event.name,
      level: event.level ?? 'INFO',
      ...event.metadata,
      timestamp: new Date().toISOString(),
    }))
  }
}

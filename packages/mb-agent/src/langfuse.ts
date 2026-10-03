interface LangfuseConfig {
  publicKey: string
  secretKey: string
  baseUrl: string
}

interface ModelSwitchEvent {
  purpose: string
  previousModelId: string | null
  newModelId: string
  activatedBy: string
  evalScore: number | null
  overrideReason: string | null
}

let config: LangfuseConfig | null = null

function logStructured(name: string, level: string, metadata: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: name, level, ...metadata, ts: new Date().toISOString() }))
}

async function sendLangfuseEvent(name: string, level: string, metadata: Record<string, unknown>): Promise<void> {
  if (!config) {
    logStructured(name, level, metadata)
    return
  }

  const body = {
    batch: [{
      id: crypto.randomUUID(),
      type: 'event-create',
      timestamp: new Date().toISOString(),
      body: { name, ...(level !== 'INFO' ? { level } : {}), metadata },
    }],
  }

  const auth = btoa(`${config.publicKey}:${config.secretKey}`)

  try {
    await fetch(`${config.baseUrl}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
    })
  } catch {
    // fire-and-forget: Langfuse unavailable should not block the caller
  }
}

export function initLangfuse(cfg: LangfuseConfig): void {
  config = cfg
}

export function getLangfuseConfig(): LangfuseConfig | null {
  return config
}

export async function trackModelSwitch(event: ModelSwitchEvent): Promise<void> {
  await sendLangfuseEvent('model-switch', 'INFO', {
    purpose: event.purpose,
    previous_model_id: event.previousModelId,
    new_model_id: event.newModelId,
    activated_by: event.activatedBy,
    eval_score: event.evalScore,
    override_reason: event.overrideReason,
  })
}

export async function trackPersistTurnFailed(sessionId: string, turnId: string, errorMessage: string): Promise<void> {
  await sendLangfuseEvent('persist_turn_failed', 'ERROR', {
    session_id: sessionId,
    turn_id: turnId,
    error: errorMessage,
  })
}

export async function trackCostPriceMissing(purpose: string, modelId: string): Promise<void> {
  await sendLangfuseEvent('cost_price_missing', 'ERROR', { purpose, model_id: modelId })
}

export async function trackCostLimitReached(sessionId: string, costUsd: number, costEur: number, callCount: number): Promise<void> {
  await sendLangfuseEvent('cost_limit_reached', 'WARNING', {
    session_id: sessionId,
    cost_usd: costUsd,
    cost_eur: costEur,
    call_count: callCount,
  })
}

export async function trackTokenBudgetExceeded(sessionId: string, estimate: { total: number; systemTokens: number; historyTokens: number; toolTokens: number }): Promise<void> {
  await sendLangfuseEvent('token_budget_exceeded', 'WARNING', {
    session_id: sessionId,
    estimated_tokens: estimate.total,
    system_tokens: estimate.systemTokens,
    history_tokens: estimate.historyTokens,
    tool_tokens: estimate.toolTokens,
  })
}

export async function trackModelFallback(event: { purpose: string; fromModel: string; toModel: string; errorClass: string }): Promise<void> {
  await sendLangfuseEvent('model_fallback', 'WARNING', {
    purpose: event.purpose,
    from_model: event.fromModel,
    to_model: event.toModel,
    error_class: event.errorClass,
  })
}

export async function trackToolError(toolName: string, errorType: string, durationMs: number): Promise<void> {
  await sendLangfuseEvent('tool_error', 'WARNING', {
    tool_name: toolName,
    error_type: errorType,
    duration_ms: durationMs,
  })
}

export async function trackDegradedResponse(reason: string): Promise<void> {
  await sendLangfuseEvent('degraded_response', 'WARNING', { reason })
}

export async function trackPromptCacheRejected(sessionId: string): Promise<void> {
  await sendLangfuseEvent('prompt_cache_rejected', 'WARNING', { session_id: sessionId })
}

export async function trackRoutingDecision(sessionId: string, event: { complexity: string; purpose: string; reason: string }): Promise<void> {
  await sendLangfuseEvent('routing_decision', 'INFO', {
    session_id: sessionId,
    complexity: event.complexity,
    purpose: event.purpose,
    reason: event.reason,
  })
}

export async function trackMissingPin(purpose: string): Promise<void> {
  await sendLangfuseEvent('model-pin-missing', 'ERROR', { purpose })
}

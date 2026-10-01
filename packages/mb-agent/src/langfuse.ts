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

export function initLangfuse(cfg: LangfuseConfig): void {
  config = cfg
}

export function getLangfuseConfig(): LangfuseConfig | null {
  return config
}

export async function trackModelSwitch(event: ModelSwitchEvent): Promise<void> {
  if (!config) return

  const body = {
    batch: [{
      id: crypto.randomUUID(),
      type: 'event-create',
      timestamp: new Date().toISOString(),
      body: {
        name: 'model-switch',
        metadata: {
          purpose: event.purpose,
          previous_model_id: event.previousModelId,
          new_model_id: event.newModelId,
          activated_by: event.activatedBy,
          eval_score: event.evalScore,
          override_reason: event.overrideReason,
        },
      },
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
    // fire-and-forget: Langfuse unavailable should not block activation
  }
}

export async function trackPersistTurnFailed(sessionId: string, turnId: string, errorMessage: string): Promise<void> {
  if (!config) return

  const body = {
    batch: [{
      id: crypto.randomUUID(),
      type: 'event-create',
      timestamp: new Date().toISOString(),
      body: {
        name: 'persist_turn_failed',
        level: 'ERROR',
        metadata: { session_id: sessionId, turn_id: turnId, error: errorMessage },
      },
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
    // fire-and-forget
  }
}

export async function trackCostPriceMissing(purpose: string, modelId: string): Promise<void> {
  if (!config) return

  const body = {
    batch: [{
      id: crypto.randomUUID(),
      type: 'event-create',
      timestamp: new Date().toISOString(),
      body: {
        name: 'cost_price_missing',
        level: 'ERROR',
        metadata: { purpose, model_id: modelId },
      },
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
    // fire-and-forget
  }
}

export async function trackCostLimitReached(sessionId: string, costUsd: number, costEur: number, callCount: number): Promise<void> {
  if (!config) return

  const body = {
    batch: [{
      id: crypto.randomUUID(),
      type: 'event-create',
      timestamp: new Date().toISOString(),
      body: {
        name: 'cost_limit_reached',
        level: 'WARNING',
        metadata: { session_id: sessionId, cost_usd: costUsd, cost_eur: costEur, call_count: callCount },
      },
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
    // fire-and-forget
  }
}

export async function trackTokenBudgetExceeded(sessionId: string, estimate: { total: number; systemTokens: number; historyTokens: number; toolTokens: number }): Promise<void> {
  if (!config) return

  const body = {
    batch: [{
      id: crypto.randomUUID(),
      type: 'event-create',
      timestamp: new Date().toISOString(),
      body: {
        name: 'token_budget_exceeded',
        level: 'WARNING',
        metadata: {
          session_id: sessionId,
          estimated_tokens: estimate.total,
          system_tokens: estimate.systemTokens,
          history_tokens: estimate.historyTokens,
          tool_tokens: estimate.toolTokens,
        },
      },
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
    // fire-and-forget
  }
}

export async function trackModelFallback(event: { purpose: string; fromModel: string; toModel: string; errorClass: string }): Promise<void> {
  if (!config) return

  const body = {
    batch: [{
      id: crypto.randomUUID(),
      type: 'event-create',
      timestamp: new Date().toISOString(),
      body: {
        name: 'model_fallback',
        level: 'WARNING',
        metadata: {
          purpose: event.purpose,
          from_model: event.fromModel,
          to_model: event.toModel,
          error_class: event.errorClass,
        },
      },
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
    // fire-and-forget
  }
}

export async function trackToolError(toolName: string, errorType: string, durationMs: number): Promise<void> {
  if (!config) return

  const body = {
    batch: [{
      id: crypto.randomUUID(),
      type: 'event-create',
      timestamp: new Date().toISOString(),
      body: {
        name: 'tool_error',
        level: 'WARNING',
        metadata: { tool_name: toolName, error_type: errorType, duration_ms: durationMs },
      },
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
    // fire-and-forget
  }
}

export async function trackDegradedResponse(reason: string): Promise<void> {
  if (!config) return

  const body = {
    batch: [{
      id: crypto.randomUUID(),
      type: 'event-create',
      timestamp: new Date().toISOString(),
      body: {
        name: 'degraded_response',
        level: 'WARNING',
        metadata: { reason },
      },
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
    // fire-and-forget
  }
}

export async function trackMissingPin(purpose: string): Promise<void> {
  if (!config) return

  const body = {
    batch: [{
      id: crypto.randomUUID(),
      type: 'event-create',
      timestamp: new Date().toISOString(),
      body: {
        name: 'model-pin-missing',
        level: 'ERROR',
        metadata: { purpose },
      },
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
    // fire-and-forget
  }
}

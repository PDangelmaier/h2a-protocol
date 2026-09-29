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

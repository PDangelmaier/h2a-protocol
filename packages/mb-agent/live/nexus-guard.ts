const MAX_CALLS = 20
const MAX_INPUT_TOKENS = 50_000

export class NexusGuardError extends Error {
  constructor(
    message: string,
    public readonly callCount: number,
    public readonly inputTokens: number,
  ) {
    super(message)
    this.name = 'NexusGuardError'
  }
}

export class SyntheticSessionError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Non-synthetic session rejected: ${sessionId}`)
    this.name = 'SyntheticSessionError'
  }
}

export const SMOKE_PREFIX = 'smoke-'

export function isSyntheticSession(sessionId: string): boolean {
  return sessionId.startsWith(SMOKE_PREFIX)
}

export interface NexusCallRecord {
  modelId: string
  status: number
  inputTokens: number
}

export function createNexusGuard() {
  let callCount = 0
  let totalInputTokens = 0
  const callLog: NexusCallRecord[] = []

  return {
    get callCount() { return callCount },
    get totalInputTokens() { return totalInputTokens },
    get callLog() { return callLog as readonly NexusCallRecord[] },
    get successfulCalls() { return callLog.filter(c => c.status === 200).length },

    checkBeforeCall(estimatedInputTokens: number) {
      if (callCount >= MAX_CALLS) {
        throw new NexusGuardError(
          `D-019: Max ${MAX_CALLS} calls reached (count: ${callCount})`,
          callCount, totalInputTokens,
        )
      }
      if (totalInputTokens + estimatedInputTokens > MAX_INPUT_TOKENS) {
        throw new NexusGuardError(
          `D-019: Would exceed ${MAX_INPUT_TOKENS} input tokens (current: ${totalInputTokens}, estimated: ${estimatedInputTokens})`,
          callCount, totalInputTokens,
        )
      }
    },

    recordCall(modelId: string, status: number, actualInputTokens: number) {
      callCount++
      totalInputTokens += actualInputTokens
      callLog.push({ modelId, status, inputTokens: actualInputTokens })
    },

    lastRespondingModel(): string | null {
      for (let i = callLog.length - 1; i >= 0; i--) {
        if (callLog[i].status === 200) return callLog[i].modelId
      }
      return null
    },

    reset() {
      callCount = 0
      totalInputTokens = 0
      callLog.length = 0
    },
  }
}

export function extractModelFromUrl(url: string, nexusEndpoint: string): string {
  const prefix = `${nexusEndpoint}/model/`
  if (!url.startsWith(prefix)) return 'unknown'
  const rest = url.slice(prefix.length)
  const slash = rest.indexOf('/')
  return slash > 0 ? rest.slice(0, slash) : rest
}

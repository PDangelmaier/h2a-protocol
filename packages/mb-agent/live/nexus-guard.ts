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

export function createNexusGuard() {
  let callCount = 0
  let totalInputTokens = 0

  return {
    get callCount() { return callCount },
    get totalInputTokens() { return totalInputTokens },

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

    recordCall(actualInputTokens: number) {
      callCount++
      totalInputTokens += actualInputTokens
    },

    reset() {
      callCount = 0
      totalInputTokens = 0
    },
  }
}

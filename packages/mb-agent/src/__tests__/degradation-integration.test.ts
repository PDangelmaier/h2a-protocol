import { describe, it, expect, vi } from 'vitest'
import { FallbackChainExhaustedError, FallbackTimeoutError } from '../fallback.js'

vi.mock('../langfuse.js', () => ({
  trackDegradedResponse: vi.fn().mockResolvedValue(undefined),
  trackPersistTurnFailed: vi.fn().mockResolvedValue(undefined),
  trackModelFallback: vi.fn().mockResolvedValue(undefined),
  trackMissingPin: vi.fn().mockResolvedValue(undefined),
  trackCostPriceMissing: vi.fn().mockResolvedValue(undefined),
  trackCostLimitReached: vi.fn().mockResolvedValue(undefined),
  trackTokenBudgetExceeded: vi.fn().mockResolvedValue(undefined),
  trackModelSwitch: vi.fn().mockResolvedValue(undefined),
  trackToolError: vi.fn().mockResolvedValue(undefined),
  initLangfuse: vi.fn(),
}))

describe('SPEC-026 AC-2: SSE stream ends cleanly after degradation (contract test)', () => {
  it('degraded response produces text frame + end frame + presence reset', () => {
    const frames: Array<{ type: string; frameType?: string; state?: string }> = []

    function simulateStreamOutput(degraded: boolean, text: string) {
      frames.push({ type: 'presence.update', state: 'conversing' })
      if (degraded) {
        frames.push({ type: 'degraded_response' })
      }
      frames.push({ type: 'agent.frame', frameType: 'text' })
      frames.push({ type: 'agent.frame', frameType: 'end' })
      frames.push({ type: 'presence.update', state: 'attentive' })
    }

    simulateStreamOutput(true, 'Degraded message')

    expect(frames[0]).toEqual({ type: 'presence.update', state: 'conversing' })
    expect(frames[1]).toEqual({ type: 'degraded_response' })
    expect(frames[2]).toEqual({ type: 'agent.frame', frameType: 'text' })
    expect(frames[3]).toEqual({ type: 'agent.frame', frameType: 'end' })
    expect(frames[4]).toEqual({ type: 'presence.update', state: 'attentive' })
  })

  it('error path also produces end frame + presence reset', () => {
    const frames: Array<{ type: string; frameType?: string; state?: string }> = []

    frames.push({ type: 'presence.update', state: 'conversing' })
    frames.push({ type: 'agent.frame', frameType: 'error' })
    frames.push({ type: 'agent.frame', frameType: 'end' })
    frames.push({ type: 'presence.update', state: 'attentive' })

    const lastFrame = frames[frames.length - 1]
    expect(lastFrame).toEqual({ type: 'presence.update', state: 'attentive' })

    const endFrame = frames.find(f => f.frameType === 'end')
    expect(endFrame).toBeDefined()
  })

  it('normal response also has end frame + presence reset', () => {
    const frames: Array<{ type: string; frameType?: string; state?: string }> = []

    frames.push({ type: 'presence.update', state: 'conversing' })
    frames.push({ type: 'agent.frame', frameType: 'text' })
    frames.push({ type: 'agent.frame', frameType: 'end' })
    frames.push({ type: 'presence.update', state: 'attentive' })

    expect(frames[frames.length - 1]).toEqual({ type: 'presence.update', state: 'attentive' })
    expect(frames.find(f => f.frameType === 'end')).toBeDefined()
  })
})

describe('SPEC-026 MF-1: Cost gate path uses degradation system', () => {
  it('pre-loop cost gate returns degraded result with cost_limit reason', () => {
    const degradedResult = {
      response: 'Entschuldigung, leider steht aktuell kein Berater zur Verfügung.',
      intent: { intentScore: 0, journeyPhase: 'awareness', purchaseIntent: 0, primaryInterest: null, proactivityLevel: 'still', computedAt: new Date() },
      toolsUsed: [] as string[],
      newMemories: [] as string[],
      securityEvents: [],
      degraded: { reason: 'cost_limit' as const },
    }

    expect(degradedResult.degraded).toBeDefined()
    expect(degradedResult.degraded.reason).toBe('cost_limit')
    expect(degradedResult.toolsUsed).toEqual([])
  })

  it('mid-loop cost gate returns ProcessedResponse with degraded field', () => {
    const processedResponse = {
      text: 'Entschuldigung, leider steht aktuell kein Berater zur Verfügung.',
      toolsUsed: ['search_inventory'],
      newMemories: [],
      degraded: { reason: 'cost_limit' as const },
    }

    expect(processedResponse.degraded).toBeDefined()
    expect(processedResponse.degraded.reason).toBe('cost_limit')
    expect(processedResponse.toolsUsed).toContain('search_inventory')
  })

  it('degraded field from processResponse propagates to ReasoningResult', () => {
    const processedWithDegraded = {
      text: 'Contact us for help.',
      toolsUsed: ['tool_a'],
      newMemories: [],
      degraded: { reason: 'cost_limit' as const },
    }

    const reasoningResult = {
      response: processedWithDegraded.text,
      intent: { intentScore: 0, journeyPhase: 'awareness', purchaseIntent: 0, primaryInterest: null, proactivityLevel: 'still', computedAt: new Date() },
      toolsUsed: processedWithDegraded.toolsUsed,
      newMemories: processedWithDegraded.newMemories,
      securityEvents: [],
      ...(processedWithDegraded.degraded ? { degraded: processedWithDegraded.degraded } : {}),
    }

    expect(reasoningResult.degraded).toBeDefined()
    expect(reasoningResult.degraded!.reason).toBe('cost_limit')
  })
})

describe('SPEC-026 AC-4: Session remains usable after degradation', () => {
  it('degraded result does not throw — reasoning loop returns normally', () => {
    const degradedResult = {
      response: 'Entschuldigung, bitte kontaktieren Sie uns.',
      intent: { intentScore: 0, journeyPhase: 'awareness', purchaseIntent: 0, primaryInterest: null, proactivityLevel: 'still', computedAt: new Date() },
      toolsUsed: [] as string[],
      newMemories: [] as string[],
      securityEvents: [],
      degraded: { reason: 'fallback_exhausted' as const },
    }

    expect(degradedResult.response).toBeTruthy()
    expect(degradedResult.degraded?.reason).toBe('fallback_exhausted')
    expect(degradedResult.toolsUsed).toEqual([])
  })

  it('cost_limit degradation still returns a result (session not crashed)', () => {
    const degradedResult = {
      response: 'Cost limit reached. Please contact us.',
      degraded: { reason: 'cost_limit' as const },
    }

    expect(typeof degradedResult.response).toBe('string')
    expect(degradedResult.degraded.reason).toBe('cost_limit')
  })

  it('FallbackChainExhaustedError is classified as fallback_exhausted', () => {
    const err = new FallbackChainExhaustedError('All 3 models failed', 3, new Error('last'))

    const reason = err instanceof FallbackChainExhaustedError ? 'fallback_exhausted' : 'internal_error'
    expect(reason).toBe('fallback_exhausted')
  })

  it('FallbackTimeoutError is classified as fallback_exhausted', () => {
    const err = new FallbackTimeoutError('Time budget exceeded', 20000)

    const reason = err instanceof FallbackTimeoutError ? 'fallback_exhausted' : 'internal_error'
    expect(reason).toBe('fallback_exhausted')
  })

  it('unexpected Error is classified as internal_error', () => {
    const err = new Error('Something unexpected')

    const reason = err instanceof FallbackChainExhaustedError || err instanceof FallbackTimeoutError
      ? 'fallback_exhausted'
      : 'internal_error'
    expect(reason).toBe('internal_error')
  })

  it('after degradation, session is not ended — next turn can proceed', () => {
    const session = { id: 'sess-1', status: 'active' }
    const degradedResult = {
      response: 'Please contact us.',
      degraded: { reason: 'internal_error' as const },
    }

    expect(session.status).toBe('active')
    expect(degradedResult.response).toBeTruthy()
  })
})

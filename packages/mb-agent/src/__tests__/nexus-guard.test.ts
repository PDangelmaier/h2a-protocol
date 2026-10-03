import { describe, it, expect, beforeEach } from 'vitest'
import {
  createNexusGuard,
  NexusGuardError,
  SyntheticSessionError,
  SMOKE_PREFIX,
  isSyntheticSession,
} from '../../live/nexus-guard.js'

describe('SPEC-042: NexusGuard D-019 limits', () => {
  let guard: ReturnType<typeof createNexusGuard>

  beforeEach(() => {
    guard = createNexusGuard()
  })

  it('AC-2: allows calls within limits', () => {
    guard.checkBeforeCall(1000)
    guard.recordCall('test-model', 200, 1000)
    expect(guard.callCount).toBe(1)
    expect(guard.totalInputTokens).toBe(1000)
  })

  it('AC-2: rejects 21st call', () => {
    for (let i = 0; i < 20; i++) {
      guard.checkBeforeCall(100)
      guard.recordCall('test-model', 200, 100)
    }
    expect(guard.callCount).toBe(20)

    expect(() => guard.checkBeforeCall(100)).toThrow(NexusGuardError)
    expect(() => guard.checkBeforeCall(100)).toThrow(/Max 20 calls/)
  })

  it('AC-2: rejects call exceeding 50K input tokens', () => {
    guard.checkBeforeCall(45_000)
    guard.recordCall('test-model', 200, 45_000)

    expect(() => guard.checkBeforeCall(6_000)).toThrow(NexusGuardError)
    expect(() => guard.checkBeforeCall(6_000)).toThrow(/50000 input tokens/)
  })

  it('AC-2: allows call exactly at token boundary', () => {
    guard.checkBeforeCall(49_000)
    guard.recordCall('test-model', 200, 49_000)

    expect(() => guard.checkBeforeCall(1_000)).not.toThrow()
  })

  it('AC-2: rejects call one token over boundary', () => {
    guard.checkBeforeCall(49_000)
    guard.recordCall('test-model', 200, 49_000)

    expect(() => guard.checkBeforeCall(1_001)).toThrow(NexusGuardError)
  })

  it('AC-2: NexusGuardError carries counters', () => {
    for (let i = 0; i < 20; i++) {
      guard.checkBeforeCall(100)
      guard.recordCall('test-model', 200, 100)
    }

    try {
      guard.checkBeforeCall(100)
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(NexusGuardError)
      const err = e as NexusGuardError
      expect(err.callCount).toBe(20)
      expect(err.inputTokens).toBe(2000)
    }
  })

  it('AC-2: reset clears counters', () => {
    guard.checkBeforeCall(100)
    guard.recordCall('test-model', 200, 100)
    guard.reset()
    expect(guard.callCount).toBe(0)
    expect(guard.totalInputTokens).toBe(0)
  })
})

describe('SPEC-042: Synthetic session guard', () => {
  it('AC-3: smoke session is accepted', () => {
    expect(isSyntheticSession(`${SMOKE_PREFIX}test-1`)).toBe(true)
  })

  it('AC-3: real session is rejected', () => {
    expect(isSyntheticSession('real-session-id')).toBe(false)
  })

  it('AC-3: empty string is rejected', () => {
    expect(isSyntheticSession('')).toBe(false)
  })

  it('AC-3: SyntheticSessionError carries session ID', () => {
    const err = new SyntheticSessionError('real-session')
    expect(err.sessionId).toBe('real-session')
    expect(err.message).toContain('real-session')
  })
})

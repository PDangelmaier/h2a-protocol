import { describe, it, expect } from 'vitest'
import { computeIntentScore, scoreToProactivity, INTENT_SIGNAL_WEIGHTS } from '../isp.js'

describe('INTENT_SIGNAL_WEIGHTS', () => {
  it('has 22 signal types', () => {
    expect(Object.keys(INTENT_SIGNAL_WEIGHTS)).toHaveLength(22)
  })

  it('has highest weight for test_drive_completed', () => {
    const max = Math.max(...Object.values(INTENT_SIGNAL_WEIGHTS))
    expect(INTENT_SIGNAL_WEIGHTS.test_drive_completed).toBe(max)
  })

  it('has lowest weight for chat_initiated', () => {
    const min = Math.min(...Object.values(INTENT_SIGNAL_WEIGHTS))
    expect(INTENT_SIGNAL_WEIGHTS.chat_initiated).toBe(min)
  })
})

describe('computeIntentScore', () => {
  it('returns 0 for no signals', () => {
    expect(computeIntentScore([], 'awareness')).toBe(0)
  })

  it('returns higher score for recent signals', () => {
    const now = new Date()
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const recent = computeIntentScore(
      [{ type: 'configurator_started', timestamp: now }],
      'configuration',
    )
    const stale = computeIntentScore(
      [{ type: 'configurator_started', timestamp: old }],
      'configuration',
    )
    expect(recent).toBeGreaterThan(stale)
  })

  it('applies phase multiplier', () => {
    const now = new Date()
    const signals = [{ type: 'configurator_started', timestamp: now }]

    const awareness = computeIntentScore(signals, 'awareness')
    const purchase = computeIntentScore(signals, 'purchase')
    expect(purchase).toBeGreaterThan(awareness)
  })

  it('respects custom weight from signal', () => {
    const now = new Date()
    const withWeight = computeIntentScore(
      [{ type: 'unknown_signal', weight: 50, timestamp: now }],
      'purchase',
    )
    const withoutWeight = computeIntentScore(
      [{ type: 'unknown_signal', timestamp: now }],
      'purchase',
    )
    expect(withWeight).toBeGreaterThan(withoutWeight)
  })

  it('clamps between 0 and 100', () => {
    const now = new Date()
    const manySignals = Array.from({ length: 50 }, () => ({
      type: 'test_drive_completed',
      timestamp: now,
    }))
    const score = computeIntentScore(manySignals, 'purchase')
    expect(score).toBeLessThanOrEqual(100)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})

describe('scoreToProactivity', () => {
  it('maps score ranges correctly', () => {
    expect(scoreToProactivity(0)).toBe('still')
    expect(scoreToProactivity(19)).toBe('still')
    expect(scoreToProactivity(20)).toBe('ready')
    expect(scoreToProactivity(39)).toBe('ready')
    expect(scoreToProactivity(40)).toBe('attentive')
    expect(scoreToProactivity(59)).toBe('attentive')
    expect(scoreToProactivity(60)).toBe('accompanying')
    expect(scoreToProactivity(79)).toBe('accompanying')
    expect(scoreToProactivity(80)).toBe('engaged')
    expect(scoreToProactivity(100)).toBe('engaged')
  })
})

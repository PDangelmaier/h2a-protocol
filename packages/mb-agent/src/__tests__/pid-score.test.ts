import { describe, it, expect } from 'vitest'
import { computePIDScore, pidScoreToTier } from '../identity.js'

describe('pidScoreToTier', () => {
  it('returns anonymous for score 0', () => {
    expect(pidScoreToTier(0)).toBe('anonymous')
  })

  it('returns recognized for score 20', () => {
    expect(pidScoreToTier(20)).toBe('recognized')
  })

  it('returns soft_login for score 40', () => {
    expect(pidScoreToTier(40)).toBe('soft_login')
  })

  it('returns identified for score 60', () => {
    expect(pidScoreToTier(60)).toBe('identified')
  })

  it('returns premium for score 80', () => {
    expect(pidScoreToTier(80)).toBe('premium')
  })

  it('returns premium for score 100', () => {
    expect(pidScoreToTier(100)).toBe('premium')
  })
})

describe('computePIDScore', () => {
  const emptyFactors = {
    hasMercedesMe: false,
    hasEmail: false,
    hasPhone: false,
    identityLinkCount: 0,
    vehicleCount: 0,
    hasConnectedVehicle: false,
    totalSessions: 0,
    daysSinceLastActive: 999,
    consentCount: 0,
  }

  it('returns 0 for anonymous user with no data', () => {
    expect(computePIDScore(emptyFactors)).toBe(0)
  })

  it('gives 20 points for Mercedes me ID', () => {
    const score = computePIDScore({ ...emptyFactors, hasMercedesMe: true })
    expect(score).toBeGreaterThanOrEqual(20)
  })

  it('adds email + phone points', () => {
    const withEmail = computePIDScore({ ...emptyFactors, hasEmail: true })
    const withBoth = computePIDScore({ ...emptyFactors, hasEmail: true, hasPhone: true })
    expect(withBoth).toBeGreaterThan(withEmail)
  })

  it('caps at 100', () => {
    const maxFactors = {
      hasMercedesMe: true,
      hasEmail: true,
      hasPhone: true,
      identityLinkCount: 10,
      vehicleCount: 5,
      hasConnectedVehicle: true,
      totalSessions: 50,
      daysSinceLastActive: 1,
      consentCount: 10,
    }
    expect(computePIDScore(maxFactors)).toBe(100)
  })

  it('gives recency bonus for active users', () => {
    const inactive = computePIDScore({ ...emptyFactors, totalSessions: 5 })
    const active = computePIDScore({ ...emptyFactors, totalSessions: 5, daysSinceLastActive: 3 })
    expect(active).toBeGreaterThan(inactive)
  })

  it('adds consent points', () => {
    const noConsent = computePIDScore(emptyFactors)
    const withConsent = computePIDScore({ ...emptyFactors, consentCount: 3 })
    expect(withConsent).toBeGreaterThan(noConsent)
  })

  it('caps identity links contribution', () => {
    const few = computePIDScore({ ...emptyFactors, identityLinkCount: 2 })
    const many = computePIDScore({ ...emptyFactors, identityLinkCount: 100 })
    expect(many - few).toBeLessThanOrEqual(7)
  })
})

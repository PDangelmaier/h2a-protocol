import { describe, it, expect } from 'vitest'

describe('M6c: intentionally red test', () => {
  it('fails on purpose for REVIEW-020 M6(c)', () => {
    expect(1).toBe(2)
  })
})

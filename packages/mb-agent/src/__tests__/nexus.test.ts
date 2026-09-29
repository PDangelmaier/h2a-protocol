import { describe, it, expect } from 'vitest'
import { NexusError } from '../nexus.js'

describe('NexusError', () => {
  it('exposes status code', () => {
    const err = new NexusError('test', 429)
    expect(err.statusCode).toBe(429)
    expect(err.message).toBe('test')
    expect(err.name).toBe('NexusError')
  })

  it('marks 429 as retryable', () => {
    expect(new NexusError('rate limit', 429).isRetryable).toBe(true)
  })

  it('marks 500+ as retryable', () => {
    expect(new NexusError('server error', 500).isRetryable).toBe(true)
    expect(new NexusError('bad gateway', 502).isRetryable).toBe(true)
  })

  it('marks 400 as not retryable', () => {
    expect(new NexusError('bad request', 400).isRetryable).toBe(false)
  })

  it('marks 401 as not retryable', () => {
    expect(new NexusError('unauthorized', 401).isRetryable).toBe(false)
  })

  it('marks 404 as not retryable', () => {
    expect(new NexusError('not found', 404).isRetryable).toBe(false)
  })
})

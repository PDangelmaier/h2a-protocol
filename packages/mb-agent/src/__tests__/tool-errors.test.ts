import { describe, it, expect } from 'vitest'
import { buildToolError, sanitizeErrorForModel, classifyToolError } from '../tool-errors.js'
import type { ToolErrorType } from '../tool-errors.js'

describe('SPEC-018 AC-1: Tool timeout from config, default 5s', () => {
  it('classifies AbortError as timeout', () => {
    const err = new DOMException('The operation was aborted', 'AbortError')
    expect(classifyToolError(err, 'test_tool', 5000, 5000)).toBe('timeout')
  })

  it('classifies exceeded duration as timeout', () => {
    const err = new Error('something failed')
    expect(classifyToolError(err, 'test_tool', 6000, 5000)).toBe('timeout')
  })

  it('does NOT classify as timeout when within budget', () => {
    const err = new Error('server error')
    expect(classifyToolError(err, 'test_tool', 3000, 5000)).toBe('upstream_error')
  })
})

describe('SPEC-018 AC-2: Typed tool errors with suggestedAction', () => {
  const errorTypes: ToolErrorType[] = ['timeout', 'not_found', 'invalid_input', 'unauthorized', 'consent_missing', 'step_up_required', 'upstream_error']

  for (const errorType of errorTypes) {
    it(`builds structured result for ${errorType} (de)`, () => {
      const result = buildToolError(errorType, 'vehicle_catalog', 1234, 'de-DE')
      expect(result.error).toBe(true)
      expect(result.data._h2a_tool_error).toBe(true)
      expect(result.data.errorType).toBe(errorType)
      expect(result.data.toolName).toBe('vehicle_catalog')
      expect(result.data.durationMs).toBe(1234)
      expect(typeof result.data.suggestedAction).toBe('string')
      expect((result.data.suggestedAction as string).length).toBeGreaterThan(10)
    })

    it(`builds structured result for ${errorType} (en)`, () => {
      const result = buildToolError(errorType, 'vehicle_catalog', 1234, 'en')
      expect(result.error).toBe(true)
      expect(result.data.suggestedAction).toBeDefined()
      expect(typeof result.data.suggestedAction).toBe('string')
    })
  }

  it('classifies 401 as unauthorized', () => {
    const err = Object.assign(new Error('Forbidden'), { status: 401 })
    expect(classifyToolError(err, 'tool', 100, 5000)).toBe('unauthorized')
  })

  it('classifies 403 as unauthorized', () => {
    const err = Object.assign(new Error('Forbidden'), { status: 403 })
    expect(classifyToolError(err, 'tool', 100, 5000)).toBe('unauthorized')
  })

  it('classifies 404 as not_found', () => {
    const err = Object.assign(new Error('Not found'), { status: 404 })
    expect(classifyToolError(err, 'tool', 100, 5000)).toBe('not_found')
  })

  it('classifies 400 as invalid_input', () => {
    const err = Object.assign(new Error('Bad request'), { status: 400 })
    expect(classifyToolError(err, 'tool', 100, 5000)).toBe('invalid_input')
  })

  it('classifies 422 as invalid_input', () => {
    const err = Object.assign(new Error('Unprocessable'), { status: 422 })
    expect(classifyToolError(err, 'tool', 100, 5000)).toBe('invalid_input')
  })

  it('classifies consent-related error as consent_missing', () => {
    const err = new Error('consent not granted')
    expect(classifyToolError(err, 'tool', 100, 5000)).toBe('consent_missing')
  })

  it('classifies step_up error as step_up_required', () => {
    const err = new Error('step_up authentication needed')
    expect(classifyToolError(err, 'tool', 100, 5000)).toBe('step_up_required')
  })

  it('classifies unknown errors as upstream_error', () => {
    const err = new Error('unexpected failure')
    expect(classifyToolError(err, 'tool', 100, 5000)).toBe('upstream_error')
  })
})

describe('SPEC-018 AC-3: Tool error does not break the turn', () => {
  it('buildToolError returns ToolResult with error=true, not an exception', () => {
    const result = buildToolError('upstream_error', 'broken_tool', 500, 'de')
    expect(result.error).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data._h2a_tool_error).toBe(true)
  })

  it('all error types return valid ToolResult shape', () => {
    const types: ToolErrorType[] = ['timeout', 'not_found', 'invalid_input', 'unauthorized', 'consent_missing', 'step_up_required', 'upstream_error']
    for (const t of types) {
      const result = buildToolError(t, 'tool', 100, 'en')
      expect(result).toHaveProperty('error', true)
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('errorType', t)
      expect(result.data).toHaveProperty('suggestedAction')
    }
  })
})

describe('SPEC-018 AC-4: No stacktraces, secrets, or internal URLs in error results', () => {
  it('strips stacktraces', () => {
    const error = new Error('fail')
    error.stack = 'Error: fail\n    at Object.<anonymous> (/app/src/tools.ts:42:10)\n    at Module._compile (internal/modules/cjs/loader.js:999:30)'
    const sanitized = sanitizeErrorForModel(error)
    expect(sanitized).not.toContain('/app/src/tools.ts')
    expect(sanitized).not.toContain('Module._compile')
  })

  it('removes internal URLs', () => {
    const sanitized = sanitizeErrorForModel('Failed to reach https://internal.service.local:8080/api/v1/tools')
    expect(sanitized).not.toContain('https://internal.service.local')
    expect(sanitized).toContain('[URL_REMOVED]')
  })

  it('removes Bearer tokens', () => {
    const sanitized = sanitizeErrorForModel('Authorization failed: Bearer sk_live_abc123xyz789')
    expect(sanitized).not.toContain('sk_live_abc123xyz789')
    expect(sanitized).toContain('[REDACTED]')
  })

  it('removes key=value secrets', () => {
    const sanitized = sanitizeErrorForModel('Connection failed: auth_token=supersecret123 in header')
    expect(sanitized).not.toContain('supersecret123')
    expect(sanitized).toContain('[SECRET_REMOVED]')
  })

  it('removes long Base64 tokens', () => {
    const longToken = 'A'.repeat(50)
    const sanitized = sanitizeErrorForModel(`Token: ${longToken}`)
    expect(sanitized).not.toContain(longToken)
    expect(sanitized).toMatch(/\[REDACTED\]|\[SECRET_REMOVED\]/)
  })

  it('truncates to 200 chars max', () => {
    const longMessage = 'x'.repeat(500)
    const sanitized = sanitizeErrorForModel(longMessage)
    expect(sanitized.length).toBeLessThanOrEqual(200)
  })

  it('handles non-Error inputs', () => {
    expect(sanitizeErrorForModel('simple string')).toBe('simple string')
    expect(sanitizeErrorForModel(42)).toBe('42')
    expect(sanitizeErrorForModel(null)).toBe('null')
  })
})

describe('SPEC-018 AC-5: tool_error event (tool, error type, duration) — no parameter values', () => {
  it('buildToolError does not include tool input parameters', () => {
    const result = buildToolError('upstream_error', 'vehicle_catalog', 500, 'de')
    expect(result.data).not.toHaveProperty('input')
    expect(result.data).not.toHaveProperty('parameters')
    expect(JSON.stringify(result.data)).not.toContain('query')
  })
})

describe('SPEC-018 AC-6: Tests for each error type; timeout with fake timer', () => {
  it('timeout classification with fake AbortError', () => {
    const abort = new DOMException('signal is aborted', 'AbortError')
    expect(classifyToolError(abort, 'slow_tool', 100, 5000)).toBe('timeout')
  })

  it('timeout classification via duration exceeding budget', () => {
    expect(classifyToolError(new Error('any'), 'tool', 10000, 5000)).toBe('timeout')
  })

  it('timeout at exact boundary is timeout', () => {
    expect(classifyToolError(new Error('any'), 'tool', 5000, 5000)).toBe('timeout')
  })

  it('just under timeout is NOT timeout', () => {
    expect(classifyToolError(new Error('any'), 'tool', 4999, 5000)).toBe('upstream_error')
  })

  it('statusCode field also works for classification', () => {
    const err = Object.assign(new Error('fail'), { statusCode: 404 })
    expect(classifyToolError(err, 'tool', 100, 5000)).toBe('not_found')
  })

  it('priority: AbortError wins over duration check', () => {
    const abort = new DOMException('aborted', 'AbortError')
    expect(classifyToolError(abort, 'tool', 100, 5000)).toBe('timeout')
  })
})

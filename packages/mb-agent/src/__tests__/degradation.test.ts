import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildDegradedResponse, formatDegradedForCustomer } from '../degradation.js'
import type { DegradationReason } from '../degradation.js'

vi.mock('../langfuse.js', () => ({
  trackDegradedResponse: vi.fn().mockResolvedValue(undefined),
}))

function makeMockSupabase(row: Record<string, unknown> | null = null) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'single']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data: row, error: row ? null : { message: 'Not found' } })
  return { from: vi.fn().mockReturnValue(chain), _chain: chain }
}

describe('SPEC-026 AC-1: Configurable degradation message with contact options (de + en)', () => {
  it('returns configured de message from DB', async () => {
    const mock = makeMockSupabase({
      message: 'Entschuldigung, bitte kontaktieren Sie uns.',
      contact_options: [
        { type: 'phone', label: 'Hotline', value: '+49 800 123' },
      ],
    })

    const result = await buildDegradedResponse('fallback_exhausted', 'de', mock as never)

    expect(result.message).toBe('Entschuldigung, bitte kontaktieren Sie uns.')
    expect(result.contactOptions).toHaveLength(1)
    expect(result.contactOptions[0].type).toBe('phone')
    expect(result.reason).toBe('fallback_exhausted')
  })

  it('returns configured en message from DB', async () => {
    const mock = makeMockSupabase({
      message: 'Sorry, please contact us.',
      contact_options: [
        { type: 'web', label: 'Contact Form', value: 'https://contact.example.com' },
      ],
    })

    const result = await buildDegradedResponse('internal_error', 'en-US', mock as never)

    expect(result.message).toBe('Sorry, please contact us.')
    expect(result.contactOptions[0].label).toBe('Contact Form')
  })

  it('falls back to hardcoded de when DB unavailable', async () => {
    const mock = makeMockSupabase(null)

    const result = await buildDegradedResponse('internal_error', 'de-AT', mock as never)

    expect(result.message).toContain('Entschuldigung')
    expect(result.message).toContain('Kundenservice')
    expect(result.contactOptions).toEqual([])
  })

  it('falls back to hardcoded en when DB unavailable', async () => {
    const mock = makeMockSupabase(null)

    const result = await buildDegradedResponse('cost_limit', 'en', mock as never)

    expect(result.message).toContain('sorry')
    expect(result.message).toContain('customer service')
  })

  it('formatDegradedForCustomer includes message and contact options', () => {
    const formatted = formatDegradedForCustomer({
      message: 'Bitte kontaktieren Sie uns.',
      contactOptions: [
        { type: 'phone', label: 'Hotline', value: '+49 800 000' },
        { type: 'web', label: 'Formular', value: 'https://example.com' },
      ],
      reason: 'fallback_exhausted',
    })

    expect(formatted).toContain('Bitte kontaktieren Sie uns.')
    expect(formatted).toContain('Hotline: +49 800 000')
    expect(formatted).toContain('Formular: https://example.com')
  })

  it('handles all three degradation reasons', async () => {
    const reasons: DegradationReason[] = ['fallback_exhausted', 'cost_limit', 'internal_error']
    for (const reason of reasons) {
      const mock = makeMockSupabase({ message: `msg-${reason}`, contact_options: [] })
      const result = await buildDegradedResponse(reason, 'de', mock as never)
      expect(result.reason).toBe(reason)
    }
  })
})

describe('SPEC-026 AC-3: degraded_response event with reason', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls trackDegradedResponse with correct reason', async () => {
    const { trackDegradedResponse } = await import('../langfuse.js')
    const mock = makeMockSupabase({ message: 'test', contact_options: [] })

    await buildDegradedResponse('fallback_exhausted', 'de', mock as never)

    expect(trackDegradedResponse).toHaveBeenCalledWith('fallback_exhausted')
  })

  it('calls trackDegradedResponse for cost_limit', async () => {
    const { trackDegradedResponse } = await import('../langfuse.js')
    const mock = makeMockSupabase({ message: 'test', contact_options: [] })

    await buildDegradedResponse('cost_limit', 'de', mock as never)

    expect(trackDegradedResponse).toHaveBeenCalledWith('cost_limit')
  })

  it('calls trackDegradedResponse for internal_error', async () => {
    const { trackDegradedResponse } = await import('../langfuse.js')
    const mock = makeMockSupabase({ message: 'test', contact_options: [] })

    await buildDegradedResponse('internal_error', 'en', mock as never)

    expect(trackDegradedResponse).toHaveBeenCalledWith('internal_error')
  })
})

describe('SPEC-026 AC-5: No internal details in degraded message', () => {
  it('message contains no stacktrace', async () => {
    const mock = makeMockSupabase({
      message: 'Bitte kontaktieren Sie uns.',
      contact_options: [{ type: 'phone', label: 'Hotline', value: '+49 800 000' }],
    })

    const result = await buildDegradedResponse('internal_error', 'de', mock as never)
    const text = formatDegradedForCustomer(result)

    expect(text).not.toMatch(/at\s+\w+\.\w+\s+\(/)
    expect(text).not.toMatch(/Error:/)
    expect(text).not.toMatch(/node_modules/)
  })

  it('message contains no model IDs', async () => {
    const mock = makeMockSupabase({
      message: 'Entschuldigung.',
      contact_options: [],
    })

    const result = await buildDegradedResponse('fallback_exhausted', 'de', mock as never)
    const text = formatDegradedForCustomer(result)

    expect(text).not.toMatch(/claude-/)
    expect(text).not.toMatch(/anthropic\./)
  })

  it('message contains no internal URLs (only configured contact URLs)', async () => {
    const mock = makeMockSupabase({
      message: 'Bitte nutzen Sie die Kontaktseite.',
      contact_options: [{ type: 'web', label: 'Kontakt', value: 'https://www.mercedes-benz.de/contact' }],
    })

    const result = await buildDegradedResponse('internal_error', 'de', mock as never)
    const text = formatDegradedForCustomer(result)

    expect(text).toContain('https://www.mercedes-benz.de/contact')
    expect(text).not.toMatch(/localhost/)
    expect(text).not.toMatch(/internal\./)
    expect(text).not.toMatch(/supabase\.co/)
  })

  it('fallback hardcoded message also has no internal details', async () => {
    const mock = makeMockSupabase(null)
    const result = await buildDegradedResponse('internal_error', 'de', mock as never)
    const text = formatDegradedForCustomer(result)

    expect(text).not.toMatch(/Error:/)
    expect(text).not.toMatch(/claude-/)
    expect(text).not.toMatch(/localhost/)
  })
})

import { describe, it, expect } from 'vitest'
import { filterSseEvent, filterPii } from '../src/pii-filter.js'

const PII_EMAIL = 'max.mustermann@mercedes-benz.com'
const PII_PHONE = '+49 711 17-0'
const PII_IBAN = 'DE89 3704 0044 0532 0130 00'
const PII_FIN = 'WDB2110611A123456'
const PII_PLATE = 'S AB 1234'
const PII_CARD = '4111 1111 1111 1111'

function assertNoRawPii(text: string): void {
  expect(text).not.toContain(PII_EMAIL)
  expect(text).not.toContain(PII_PHONE)
  expect(text).not.toContain(PII_IBAN)
  expect(text).not.toContain(PII_FIN)
  expect(text).not.toContain(PII_PLATE)
  expect(text).not.toContain(PII_CARD)
}

function assertHasMask(text: string): void {
  expect(text).toContain('***')
}

function stringify(val: unknown): string {
  return JSON.stringify(val)
}

describe('AC-2 E2E: filterSseEvent — alle 6 SSE-Event-Typen + JSON-Fehler', () => {
  describe('presence events', () => {
    it('filters PII from presence.update state field', () => {
      const event = { type: 'presence.update', state: `conversing about ${PII_EMAIL}` }
      const { event: filtered, piiHits } = filterSseEvent(event)
      const out = stringify(filtered)
      assertNoRawPii(out)
      assertHasMask(out)
      expect(piiHits.length).toBeGreaterThan(0)
      expect(piiHits.some(h => h.type === 'email')).toBe(true)
    })

    it('filters PII from nested presence metadata', () => {
      const event = {
        type: 'presence.update',
        state: 'conversing',
        metadata: { context: `Kunde ${PII_PHONE} ist online` },
      }
      const { event: filtered, piiHits } = filterSseEvent(event)
      assertNoRawPii(stringify(filtered))
      expect(piiHits.some(h => h.type === 'phone')).toBe(true)
    })
  })

  describe('status events', () => {
    it('filters PII from status event message', () => {
      const event = { type: 'status', toolName: 'lookup', message: `Suche nach ${PII_FIN}` }
      const { event: filtered, piiHits } = filterSseEvent(event)
      assertNoRawPii(stringify(filtered))
      assertHasMask(stringify(filtered))
      expect(piiHits.some(h => h.type === 'fin')).toBe(true)
    })

    it('filters PII from status event detail fields', () => {
      const event = {
        type: 'status',
        toolName: 'crm',
        message: 'Kundendaten geladen',
        detail: { customerId: 'c-1', email: PII_EMAIL, iban: PII_IBAN },
      }
      const { event: filtered, piiHits } = filterSseEvent(event)
      const out = stringify(filtered)
      assertNoRawPii(out)
      expect(piiHits.some(h => h.type === 'email')).toBe(true)
      expect(piiHits.some(h => h.type === 'iban')).toBe(true)
    })
  })

  describe('degraded_response events', () => {
    it('filters PII from degraded reason', () => {
      const event = {
        type: 'degraded_response',
        reason: `Timeout bei Abfrage für ${PII_EMAIL}`,
      }
      const { event: filtered, piiHits } = filterSseEvent(event)
      assertNoRawPii(stringify(filtered))
      expect(piiHits.some(h => h.type === 'email')).toBe(true)
    })
  })

  describe('agent.frame text events', () => {
    it('filters all PII types from text response', () => {
      const event = {
        type: 'agent.frame',
        frameType: 'text',
        content: {
          text: `Ihr Fahrzeug ${PII_FIN} mit Kennzeichen ${PII_PLATE} ist registriert. Kontakt: ${PII_EMAIL}, Tel: ${PII_PHONE}. IBAN: ${PII_IBAN}. Karte: ${PII_CARD}.`,
          streaming: false,
        },
      }
      const { event: filtered, piiHits } = filterSseEvent(event)
      const out = stringify(filtered)
      assertNoRawPii(out)
      expect(piiHits.length).toBeGreaterThanOrEqual(6)
      const types = new Set(piiHits.map(h => h.type))
      expect(types.has('fin')).toBe(true)
      expect(types.has('plate')).toBe(true)
      expect(types.has('email')).toBe(true)
      expect(types.has('phone')).toBe(true)
      expect(types.has('iban')).toBe(true)
      expect(types.has('card')).toBe(true)
    })

    it('filters PII from streaming text chunks', () => {
      const event = {
        type: 'agent.frame',
        frameType: 'text',
        content: { text: `Bitte senden Sie an ${PII_EMAIL}`, streaming: true },
      }
      const { event: filtered, piiHits } = filterSseEvent(event)
      assertNoRawPii(stringify(filtered))
      expect(piiHits.some(h => h.type === 'email')).toBe(true)
    })

    it('filters PII from array content', () => {
      const event = {
        type: 'agent.frame',
        frameType: 'text',
        content: {
          parts: [`Fahrzeug: ${PII_FIN}`, `IBAN: ${PII_IBAN}`],
        },
      }
      const { event: filtered, piiHits } = filterSseEvent(event)
      const out = stringify(filtered)
      assertNoRawPii(out)
      expect(piiHits.some(h => h.type === 'fin')).toBe(true)
      expect(piiHits.some(h => h.type === 'iban')).toBe(true)
    })
  })

  describe('agent.frame error events', () => {
    it('filters PII from error message', () => {
      const event = {
        type: 'agent.frame',
        frameType: 'error',
        content: { message: `Fehler bei Kunde ${PII_EMAIL}: DB-Timeout` },
      }
      const { event: filtered, piiHits } = filterSseEvent(event)
      assertNoRawPii(stringify(filtered))
      expect(piiHits.some(h => h.type === 'email')).toBe(true)
    })

    it('filters PII from error detail fields', () => {
      const event = {
        type: 'agent.frame',
        frameType: 'error',
        content: {
          message: 'Interner Fehler',
          detail: `Stack: Lookup failed for FIN ${PII_FIN}`,
        },
      }
      const { event: filtered, piiHits } = filterSseEvent(event)
      assertNoRawPii(stringify(filtered))
      expect(piiHits.some(h => h.type === 'fin')).toBe(true)
    })
  })

  describe('agent.frame end events', () => {
    it('filters PII even from end-frame metadata', () => {
      const event = {
        type: 'agent.frame',
        frameType: 'end',
        content: {},
        meta: { summary: `Session für ${PII_EMAIL} beendet` },
      }
      const { event: filtered, piiHits } = filterSseEvent(event)
      assertNoRawPii(stringify(filtered))
      expect(piiHits.some(h => h.type === 'email')).toBe(true)
    })

    it('clean end event passes through unchanged', () => {
      const event = { type: 'agent.frame', frameType: 'end', content: {} }
      const { event: filtered, piiHits } = filterSseEvent(event)
      expect(filtered).toEqual(event)
      expect(piiHits).toEqual([])
    })
  })

  describe('JSON error response path', () => {
    it('filterPii removes email from error message', () => {
      const raw = `Could not find customer ${PII_EMAIL}`
      const { text, hits } = filterPii(raw)
      expect(text).not.toContain(PII_EMAIL)
      assertHasMask(text)
      expect(hits.some(h => h.type === 'email')).toBe(true)
    })

    it('filterPii removes FIN from database error', () => {
      const raw = `Constraint violation for VIN ${PII_FIN} in table vehicles`
      const { text, hits } = filterPii(raw)
      expect(text).not.toContain(PII_FIN)
      expect(hits.some(h => h.type === 'fin')).toBe(true)
    })

    it('filterPii removes phone from exception text', () => {
      const raw = `SMS delivery failed for ${PII_PHONE}`
      const { text, hits } = filterPii(raw)
      expect(text).not.toContain(PII_PHONE)
      expect(hits.some(h => h.type === 'phone')).toBe(true)
    })

    it('filterPii removes IBAN from payment error', () => {
      const raw = `Payment failed: invalid IBAN ${PII_IBAN}`
      const { text, hits } = filterPii(raw)
      expect(text).not.toContain('0532 0130 00')
      expect(hits.some(h => h.type === 'iban')).toBe(true)
    })

    it('safe error messages pass through unchanged', () => {
      const raw = 'An unexpected error occurred'
      const { text, hits } = filterPii(raw)
      expect(text).toBe(raw)
      expect(hits).toEqual([])
    })
  })

  describe('pii_masked side-channel event generation', () => {
    it('filterSseEvent returns piiHits for downstream pii_masked event', () => {
      const event = {
        type: 'agent.frame',
        frameType: 'text',
        content: { text: `FIN: ${PII_FIN}` },
      }
      const { piiHits } = filterSseEvent(event)
      expect(piiHits.length).toBeGreaterThan(0)
      expect(piiHits[0].type).toBe('fin')
      expect(piiHits[0].count).toBe(1)
    })

    it('multiple PII types produce multiple hit entries', () => {
      const event = {
        type: 'agent.frame',
        frameType: 'text',
        content: { text: `${PII_EMAIL} hat FIN ${PII_FIN}` },
      }
      const { piiHits } = filterSseEvent(event)
      const types = piiHits.map(h => h.type)
      expect(types).toContain('email')
      expect(types).toContain('fin')
    })
  })

  describe('edge handler integration patterns', () => {
    it('pushEvent pattern: presence → status → text → end cycle', () => {
      const events = [
        { type: 'presence.update', state: `conversing ${PII_EMAIL}` },
        { type: 'status', toolName: 'search', message: `Suche FIN ${PII_FIN}` },
        { type: 'agent.frame', frameType: 'text', content: { text: `Ergebnis für ${PII_PLATE}`, streaming: false } },
        { type: 'agent.frame', frameType: 'end', content: {} },
        { type: 'presence.update', state: 'attentive' },
      ]

      let totalHits = 0
      for (const event of events) {
        const { event: filtered, piiHits } = filterSseEvent(event)
        assertNoRawPii(stringify(filtered))
        totalHits += piiHits.length
      }
      expect(totalHits).toBeGreaterThanOrEqual(3)
    })

    it('error cycle: presence → error → end → presence', () => {
      const events = [
        { type: 'presence.update', state: 'conversing' },
        { type: 'agent.frame', frameType: 'error', content: { message: `DB-Error für ${PII_PHONE}` } },
        { type: 'agent.frame', frameType: 'end', content: {} },
        { type: 'presence.update', state: 'attentive' },
      ]

      for (const event of events) {
        const { event: filtered } = filterSseEvent(event)
        assertNoRawPii(stringify(filtered))
      }
    })

    it('degraded cycle with security event', () => {
      const events = [
        { type: 'presence.update', state: 'conversing' },
        { type: 'security_event', eventType: 'pii_detected' },
        { type: 'degraded_response', reason: `Modell-Timeout nach Anfrage mit ${PII_IBAN}` },
        { type: 'agent.frame', frameType: 'end', content: {} },
        { type: 'presence.update', state: 'attentive' },
      ]

      for (const event of events) {
        const { event: filtered } = filterSseEvent(event)
        assertNoRawPii(stringify(filtered))
      }
    })
  })
})

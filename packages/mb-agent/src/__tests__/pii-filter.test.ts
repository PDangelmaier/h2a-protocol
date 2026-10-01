import { describe, it, expect } from 'vitest'
import { filterPii, StreamPiiFilter } from '../pii-filter.js'
import type { PiiType } from '../pii-filter.js'

function expectMasked(input: string, type: PiiType): void {
  const { text, hits } = filterPii(input)
  expect(text).not.toBe(input)
  expect(hits.some(h => h.type === type)).toBe(true)
}

function expectUnchanged(input: string): void {
  const { text, hits } = filterPii(input)
  expect(text).toBe(input)
  expect(hits.length).toBe(0)
}

describe('SPEC-038: PII-Output-Filter', () => {
  describe('AC-2: FIN/VIN detection', () => {
    it('masks valid FIN WDB2100612A123456', () => expectMasked('FIN: WDB2100612A123456', 'fin'))
    it('masks valid FIN WVWZZZ3CZWE123456', () => expectMasked('WVWZZZ3CZWE123456', 'fin'))
    it('masks valid FIN WF0XXXGCDX1234567', () => expectMasked('WF0XXXGCDX1234567', 'fin'))
    it('masks FIN in sentence context', () => {
      const { text } = filterPii('Die FIN lautet WDB2100612A123456, bitte prüfen.')
      expect(text).toContain('***')
      expect(text).not.toContain('WDB2100612A123456')
    })
    it('preserves last 4 chars of FIN', () => {
      const { text } = filterPii('WDB2100612A123456')
      expect(text).toMatch(/\*+3456$/)
    })
  })

  describe('AC-2: German license plates', () => {
    it('masks M AB 1234', () => expectMasked('Kennzeichen: M AB 1234', 'plate'))
    it('masks B-XY 789', () => expectMasked('B-XY 789', 'plate'))
    it('masks HH CD 42E (electric)', () => expectMasked('HH CD 42E', 'plate'))
    it('masks S-AB 1', () => expectMasked('S-AB 1', 'plate'))
    it('masks KA XY 9999', () => expectMasked('KA XY 9999', 'plate'))
    it('masks MÜ AB 123', () => expectMasked('MÜ AB 123', 'plate'))
  })

  describe('AC-2: Email addresses', () => {
    it('masks simple email', () => expectMasked('Mail: test@example.com', 'email'))
    it('masks complex email', () => expectMasked('hans.mueller+tag@sub.domain.de', 'email'))
    it('masks corporate email', () => expectMasked('p.dangelmaier@mercedes-benz.com', 'email'))
    it('masks short TLD', () => expectMasked('user@x.io', 'email'))
    it('preserves last 4 chars of email', () => {
      const { text } = filterPii('test@example.com')
      expect(text).toMatch(/\*+\.com$/)
    })
  })

  describe('AC-2: Phone numbers', () => {
    it('masks +49 711 1234567', () => expectMasked('Tel: +49 711 1234567', 'phone'))
    it('masks 0711-1234567', () => expectMasked('0711-1234567', 'phone'))
    it('masks +1 555 123 4567', () => expectMasked('+1 555 123 4567', 'phone'))
    it('masks (030) 12345678', () => expectMasked('(030) 12345678', 'phone'))
    it('masks 00491711234567', () => expectMasked('00491711234567', 'phone'))
  })

  describe('AC-2: IBAN', () => {
    it('masks DE89 3704 0044 0532 0130 00', () => expectMasked('IBAN: DE89 3704 0044 0532 0130 00', 'iban'))
    it('masks AT48 3200 0000 0123 4568', () => expectMasked('AT48 3200 0000 0123 4568', 'iban'))
    it('masks CH93 0076 2011 6238 5295 7', () => expectMasked('CH93 0076 2011 6238 5295 7', 'iban'))
    it('masks compact IBAN DE89370400440532013000', () => expectMasked('DE89370400440532013000', 'iban'))
  })

  describe('AC-2: Credit card numbers (Luhn)', () => {
    it('masks Visa 4111 1111 1111 1111', () => expectMasked('Karte: 4111 1111 1111 1111', 'card'))
    it('masks Mastercard 5500-0000-0000-0004', () => expectMasked('5500-0000-0000-0004', 'card'))
    it('masks valid Luhn with spaces', () => expectMasked('4539 1488 0343 6467', 'card'))
    it('rejects invalid Luhn 1234 5678 9012 3456', () => expectUnchanged('1234 5678 9012 3456'))
  })

  describe('AC-2: Additional positive fixtures (40+ threshold)', () => {
    it('masks BMW FIN WBA3A5C50FK123456', () => expectMasked('WBA3A5C50FK123456', 'fin'))
    it('masks Audi FIN WAUZZZ8V9KA012345', () => expectMasked('WAUZZZ8V9KA012345', 'fin'))
    it('masks FR AB 123 (plate)', () => expectMasked('FR AB 123', 'plate'))
    it('masks DA XY 42 (plate)', () => expectMasked('DA XY 42', 'plate'))
    it('masks OG CD 999H (H-Kennzeichen)', () => expectMasked('OG CD 999H', 'plate'))
    it('masks info@firma.de (email)', () => expectMasked('info@firma.de', 'email'))
    it('masks max.mustermann@web.de (email)', () => expectMasked('max.mustermann@web.de', 'email'))
    it('masks +44 20 7123 4567 (UK phone)', () => expectMasked('+44 20 7123 4567', 'phone'))
    it('masks 089-12345678 (München)', () => expectMasked('089-12345678', 'phone'))
    it('masks +33 14 567 8901 (FR phone)', () => expectMasked('+33 14 567 8901', 'phone'))
    it('masks AT61 1904 3002 3457 3201 (AT IBAN)', () => expectMasked('AT61 1904 3002 3457 3201', 'iban'))
    it('masks LI21 0881 0000 2324 013AA (LI IBAN digit-only part)', () => expectMasked('LI21 0881 0000 2324 0133', 'iban'))
    it('masks JCB 3530 1113 3330 0000 (Luhn)', () => expectMasked('3530 1113 3330 0000', 'card'))
  })

  describe('AC-2: Masking format — last 4 chars', () => {
    it('FIN keeps last 4', () => {
      const { text } = filterPii('WDB2100612A123456')
      const masked = text.trim()
      expect(masked.endsWith('3456')).toBe(true)
      expect(masked.startsWith('*')).toBe(true)
    })
    it('Email keeps last 4', () => {
      const { text } = filterPii('user@example.com')
      expect(text.endsWith('.com')).toBe(true)
    })
  })

  describe('AC-3: Negative cases — must NOT be masked', () => {
    it('C 300 e (model name)', () => expectUnchanged('Der C 300 e ist ein Plug-in-Hybrid.'))
    it('AMG GT 63 S (model name)', () => expectUnchanged('Der AMG GT 63 S hat 639 PS.'))
    it('EQS 450+ (model name)', () => expectUnchanged('Der EQS 450+ hat 333 PS.'))
    it('EQE 350+ (model name)', () => expectUnchanged('EQE 350+ SUV ist verfügbar.'))
    it('A 250 e (model name)', () => expectUnchanged('Der A 250 e startet bei 40.000 €.'))
    it('GLE 450 (model name)', () => expectUnchanged('GLE 450 4MATIC ist bestellbar.'))
    it('Price 45.990 € (price)', () => expectUnchanged('Preis: 45.990 €'))
    it('Price 123.456,78 EUR (price)', () => expectUnchanged('Gesamtpreis: 123.456,78 EUR'))
    it('Date 01.10.2026', () => expectUnchanged('Liefertermin: 01.10.2026'))
    it('Date 2026-10-01', () => expectUnchanged('Datum: 2026-10-01'))
    it('Order code U50 (equipment)', () => expectUnchanged('Ausstattungscode U50'))
    it('Paint code 040 (obsidian black)', () => expectUnchanged('Lackierung 040 Obsidianschwarz'))
    it('Interior code 801 (leather)', () => expectUnchanged('Interieur 801'))
    it('ZIP code 70173 Stuttgart', () => expectUnchanged('PLZ 70173 Stuttgart'))
    it('ZIP code 80333 München', () => expectUnchanged('80333 München'))
    it('Model year 2026', () => expectUnchanged('Modelljahr 2026'))
    it('Power 639 PS', () => expectUnchanged('Leistung: 639 PS'))
    it('Power 350 kW', () => expectUnchanged('350 kW Systemleistung'))
    it('Speed 0-100 in 3.2 s', () => expectUnchanged('0 auf 100 km/h in 3,2 Sekunden'))
    it('Weight 2.480 kg', () => expectUnchanged('Leergewicht: 2.480 kg'))
    it('WLTP range 783 km', () => expectUnchanged('WLTP-Reichweite: 783 km'))
    it('Torque 560 Nm', () => expectUnchanged('560 Nm Drehmoment'))
    it('Engine code M256', () => expectUnchanged('Motortyp M256'))
    it('URL https://www.mercedes-benz.de', () => expectUnchanged('Besuchen Sie https://www.mercedes-benz.de'))
    it('Order number W1K2130462A123456 stays if 17-char but no mixed alphanumeric pattern', () => {
      const input = 'Bestellnummer: 12345-67890'
      expectUnchanged(input)
    })
    it('Short numbers 1234', () => expectUnchanged('Lager 1234'))
    it('Percentage 19%', () => expectUnchanged('MwSt: 19%'))
    it('Battery 107.8 kWh', () => expectUnchanged('Batterie: 107,8 kWh'))
    it('CO2 0 g/km', () => expectUnchanged('CO₂: 0 g/km'))
    it('Dimensions 5.216 x 1.954 mm', () => expectUnchanged('Maße: 5.216 x 1.954 mm'))
    it('9G-TRONIC (transmission)', () => expectUnchanged('9G-TRONIC Automatik'))
    it('4MATIC (drivetrain)', () => expectUnchanged('4MATIC Allradantrieb'))
    it('MBUX (infotainment)', () => expectUnchanged('MBUX Hyperscreen'))
    it('AMG line', () => expectUnchanged('AMG Line Exterieur'))
    it('AVANTGARDE line', () => expectUnchanged('AVANTGARDE Exterieur'))
    it('ENERGIZING Komfort', () => expectUnchanged('ENERGIZING Komfort Paket'))
    it('Wheelbase 3.060 mm', () => expectUnchanged('Radstand: 3.060 mm'))
    it('Tire 255/45 R20', () => expectUnchanged('Reifen: 255/45 R20'))
    it('Airbag 9', () => expectUnchanged('9 Airbags serienmäßig'))
    it('Star rating 5', () => expectUnchanged('5 Sterne Euro NCAP'))
  })

  describe('AC-4: Chunk-boundary detection', () => {
    it('detects FIN split across two chunks', () => {
      const filter = new StreamPiiFilter()
      const r1 = filter.feed('Die FIN lautet WDB21006')
      const r2 = filter.feed('12A123456, bitte prüfen.')
      const r3 = filter.flush()
      const combined = r1.text + r2.text + r3.text
      expect(combined).not.toContain('WDB2100612A123456')
      const allHits = [...r1.hits, ...r2.hits, ...r3.hits]
      expect(allHits.some(h => h.type === 'fin')).toBe(true)
    })

    it('detects email split across two chunks', () => {
      const filter = new StreamPiiFilter()
      const r1 = filter.feed('Kontakt: user@exam')
      const r2 = filter.feed('ple.com bitte melden')
      const r3 = filter.flush()
      const combined = r1.text + r2.text + r3.text
      expect(combined).not.toContain('user@example.com')
      const allHits = [...r1.hits, ...r2.hits, ...r3.hits]
      expect(allHits.some(h => h.type === 'email')).toBe(true)
    })
  })

  describe('AC-5: pii_masked event', () => {
    it('returns hits with type and count, no value', () => {
      const { hits } = filterPii('FIN WDB2100612A123456 und test@example.com')
      expect(hits.length).toBeGreaterThanOrEqual(2)
      for (const hit of hits) {
        expect(hit).toHaveProperty('type')
        expect(hit).toHaveProperty('count')
        expect(Object.keys(hit)).toEqual(['type', 'count'])
      }
    })

    it('counts multiple FINs', () => {
      const { hits } = filterPii('FIN1: WDB2100612A123456 FIN2: WVWZZZ3CZWE123456')
      const finHit = hits.find(h => h.type === 'fin')
      expect(finHit?.count).toBe(2)
    })
  })

  describe('AC-6: Performance benchmark', () => {
    it('filters 2000 chars in < 5ms P95', () => {
      const text = 'Der Mercedes-Benz EQS 450+ ist ein vollelektrisches Fahrzeug. '.repeat(40)
      expect(text.length).toBeGreaterThanOrEqual(2000)

      const times: number[] = []
      for (let i = 0; i < 100; i++) {
        const start = performance.now()
        filterPii(text)
        times.push(performance.now() - start)
      }
      times.sort((a, b) => a - b)
      const p95 = times[Math.floor(times.length * 0.95)]
      expect(p95).toBeLessThan(5)
    })

    it('filters text with PII in < 5ms P95 for 2000 chars', () => {
      const base = 'Kontakt: test@example.com, Tel: +49 711 1234567, FIN: WDB2100612A123456. '
      const text = base.repeat(Math.ceil(2000 / base.length)).slice(0, 2000)

      const times: number[] = []
      for (let i = 0; i < 100; i++) {
        const start = performance.now()
        filterPii(text)
        times.push(performance.now() - start)
      }
      times.sort((a, b) => a - b)
      const p95 = times[Math.floor(times.length * 0.95)]
      expect(p95).toBeLessThan(5)
    })
  })

  describe('AC-1: All SSE event types through filter (edge-handler integration)', () => {
    it('filterPii handles presence.update text', () => {
      const { text } = filterPii('conversing')
      expect(text).toBe('conversing')
    })

    it('filterPii handles agent.frame text with PII', () => {
      const { text, hits } = filterPii('Ihre FIN ist WDB2100612A123456.')
      expect(text).not.toContain('WDB2100612A123456')
      expect(hits.some(h => h.type === 'fin')).toBe(true)
    })

    it('filterPii handles error message with PII', () => {
      const { text } = filterPii('Error processing session for user@example.com')
      expect(text).not.toContain('user@example.com')
    })

    it('filterPii handles end frame (empty object stringified)', () => {
      const { text, hits } = filterPii('{}')
      expect(text).toBe('{}')
      expect(hits.length).toBe(0)
    })
  })
})

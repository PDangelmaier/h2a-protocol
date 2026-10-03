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

describe('SPEC-047: PII-Katalog — Positive Fixtures (60+)', () => {
  describe('FIN/VIN (17 chars, mixed alphanumeric)', () => {
    it('masks WDB2100612A123456', () => expectMasked('FIN: WDB2100612A123456', 'fin'))
    it('masks WVWZZZ3CZWE123456', () => expectMasked('WVWZZZ3CZWE123456', 'fin'))
    it('masks WF0XXXGCDX1234567', () => expectMasked('WF0XXXGCDX1234567', 'fin'))
    it('masks BMW WBA3A5C50FK123456', () => expectMasked('WBA3A5C50FK123456', 'fin'))
    it('masks Audi WAUZZZ8V9KA012345', () => expectMasked('WAUZZZ8V9KA012345', 'fin'))
    it('masks FIN in sentence', () => {
      const { text } = filterPii('Die FIN lautet WDB2100612A123456, bitte prüfen.')
      expect(text).not.toContain('WDB2100612A123456')
    })
    it('masks lowercase FIN wdb2100612a123456', () => expectMasked('wdb2100612a123456', 'fin'))
    it('masks spaced FIN WDB 210061 2A 123456', () => expectMasked('WDB 210061 2A 123456', 'fin'))
    it('masks dashed FIN WDB-2100612A-123456', () => expectMasked('WDB-2100612A-123456', 'fin'))
    it('preserves last 4 chars of FIN', () => {
      const { text } = filterPii('WDB2100612A123456')
      expect(text).toMatch(/\*+3456$/)
    })
  })

  describe('German license plates', () => {
    it('masks M AB 1234', () => expectMasked('Kennzeichen: M AB 1234', 'plate'))
    it('masks B-XY 789', () => expectMasked('B-XY 789', 'plate'))
    it('masks HH CD 42E (electric)', () => expectMasked('HH CD 42E', 'plate'))
    it('masks S-AB 1', () => expectMasked('S-AB 1', 'plate'))
    it('masks KA XY 9999', () => expectMasked('KA XY 9999', 'plate'))
    it('masks MÜ AB 123', () => expectMasked('MÜ AB 123', 'plate'))
    it('masks FR AB 123', () => expectMasked('FR AB 123', 'plate'))
    it('masks DA XY 42', () => expectMasked('DA XY 42', 'plate'))
    it('masks OG CD 999H (H-Kennzeichen)', () => expectMasked('OG CD 999H', 'plate'))
    it('masks lowercase s-ab 1234', () => expectMasked('s-ab 1234', 'plate'))
    it('masks B-AB 1 (short plate)', () => expectMasked('B-AB 1', 'plate'))
    it('masks S-GT 63', () => expectMasked('S-GT 63', 'plate'))
    it('masks S-AMG 63', () => expectMasked('S-AMG 63', 'plate'))
    it('masks S-MB 1234', () => expectMasked('S-MB 1234', 'plate'))
  })

  describe('Email addresses', () => {
    it('masks test@example.com', () => expectMasked('Mail: test@example.com', 'email'))
    it('masks hans.mueller+tag@sub.domain.de', () => expectMasked('hans.mueller+tag@sub.domain.de', 'email'))
    it('masks p.dangelmaier@mercedes-benz.com', () => expectMasked('p.dangelmaier@mercedes-benz.com', 'email'))
    it('masks user@x.io (short TLD)', () => expectMasked('user@x.io', 'email'))
    it('masks info@firma.de', () => expectMasked('info@firma.de', 'email'))
    it('masks max.mustermann@web.de', () => expectMasked('max.mustermann@web.de', 'email'))
    it('masks max (at) firma.de', () => expectMasked('max (at) firma.de', 'email'))
    it('masks max @ firma.de (spaces around @)', () => expectMasked('max @ firma.de', 'email'))
    it('preserves last 4 chars of email', () => {
      const { text } = filterPii('user@example.com')
      expect(text.endsWith('.com')).toBe(true)
    })
  })

  describe('Phone numbers', () => {
    it('masks +49 711 1234567', () => expectMasked('Tel: +49 711 1234567', 'phone'))
    it('masks 0711-1234567', () => expectMasked('0711-1234567', 'phone'))
    it('masks +1 555 123 4567', () => expectMasked('+1 555 123 4567', 'phone'))
    it('masks (030) 12345678', () => expectMasked('(030) 12345678', 'phone'))
    it('masks 00491711234567', () => expectMasked('00491711234567', 'phone'))
    it('masks +44 20 7123 4567 (UK)', () => expectMasked('+44 20 7123 4567', 'phone'))
    it('masks 089-12345678 (München)', () => expectMasked('089-12345678', 'phone'))
    it('masks +33 14 567 8901 (FR)', () => expectMasked('+33 14 567 8901', 'phone'))
    it('masks +49 (0)711 1234567', () => expectMasked('+49 (0)711 1234567', 'phone'))
    it('masks 0711/1234567', () => expectMasked('0711/1234567', 'phone'))
    it('masks 0711 / 1234567', () => expectMasked('0711 / 1234567', 'phone'))
    it('masks 07171/12345', () => expectMasked('07171/12345', 'phone'))
    it('masks +49.711.1234567', () => expectMasked('+49.711.1234567', 'phone'))
    it('masks +49 711 123 45 67 (fully segmented)', () => expectMasked('+49 711 123 45 67', 'phone'))
  })

  describe('IBAN', () => {
    it('masks DE89 3704 0044 0532 0130 00', () => expectMasked('IBAN: DE89 3704 0044 0532 0130 00', 'iban'))
    it('masks AT48 3200 0000 0123 4568', () => expectMasked('AT48 3200 0000 0123 4568', 'iban'))
    it('masks CH93 0076 2011 6238 5295 7', () => expectMasked('CH93 0076 2011 6238 5295 7', 'iban'))
    it('masks compact DE89370400440532013000', () => expectMasked('DE89370400440532013000', 'iban'))
    it('masks AT61 1904 3002 3457 3201', () => expectMasked('AT61 1904 3002 3457 3201', 'iban'))
    it('masks LI21 0881 0000 2324 0133', () => expectMasked('LI21 0881 0000 2324 0133', 'iban'))
    it('masks GB29 NWBK 6016 1331 9268 19 (UK alphanumeric)', () => expectMasked('GB29 NWBK 6016 1331 9268 19', 'iban'))
    it('masks NL91 ABNA 0417 1643 00 (NL)', () => expectMasked('NL91 ABNA 0417 1643 00', 'iban'))
    it('masks FR76 3000 6000 0112 3456 7890 189 (FR)', () => expectMasked('FR76 3000 6000 0112 3456 7890', 'iban'))
    it('masks lowercase de89370400440532013000', () => expectMasked('de89370400440532013000', 'iban'))
    it('masks dashed DE89-3704-0044-0532-0130-00', () => expectMasked('DE89-3704-0044-0532-0130-00', 'iban'))
  })

  describe('Credit card numbers (Luhn)', () => {
    it('masks Visa 4111 1111 1111 1111', () => expectMasked('Karte: 4111 1111 1111 1111', 'card'))
    it('masks Mastercard 5500-0000-0000-0004', () => expectMasked('5500-0000-0000-0004', 'card'))
    it('masks valid Luhn with spaces 4539 1488 0343 6467', () => expectMasked('4539 1488 0343 6467', 'card'))
    it('masks JCB 3530 1113 3330 0000', () => expectMasked('3530 1113 3330 0000', 'card'))
    it('masks dot-separated 4111.1111.1111.1111', () => expectMasked('4111.1111.1111.1111', 'card'))
    it('rejects invalid Luhn 1234 5678 9012 3456', () => expectUnchanged('1234 5678 9012 3456'))
  })

  describe('Masking format — last 4 chars', () => {
    it('FIN keeps last 4', () => {
      const { text } = filterPii('WDB2100612A123456')
      expect(text.endsWith('3456')).toBe(true)
      expect(text.startsWith('*')).toBe(true)
    })
    it('Email keeps last 4', () => {
      const { text } = filterPii('user@example.com')
      expect(text.endsWith('.com')).toBe(true)
    })
  })
})

describe('SPEC-047: PII-Katalog — Negative Fixtures (100+)', () => {
  describe('Mercedes model names', () => {
    it('C 300 e', () => expectUnchanged('Der C 300 e ist ein Plug-in-Hybrid.'))
    it('AMG GT 63 S', () => expectUnchanged('Der AMG GT 63 S hat 639 PS.'))
    it('EQS 450+', () => expectUnchanged('Der EQS 450+ hat 333 PS.'))
    it('EQE 350+', () => expectUnchanged('EQE 350+ SUV ist verfügbar.'))
    it('A 250 e', () => expectUnchanged('Der A 250 e startet bei 40.000 €.'))
    it('GLE 450', () => expectUnchanged('GLE 450 4MATIC ist bestellbar.'))
    it('GLS 600', () => expectUnchanged('Der GLS 600 hat einen V8.'))
    it('CLE 300', () => expectUnchanged('Der CLE 300 ist ein Coupé.'))
    it('EQV 300', () => expectUnchanged('Der EQV 300 ist vollelektrisch.'))
    it('SL 63 AMG', () => expectUnchanged('Der SL 63 AMG ist ein Roadster.'))
    it('CL 500', () => expectUnchanged('Der CL 500 war ein Grand Tourer.'))
    it('ML 350', () => expectUnchanged('Der ML 350 ist ein SUV.'))
    it('EQE SUV 500', () => expectUnchanged('Der EQE SUV 500 hat 408 PS.'))
    it('GLA 200', () => expectUnchanged('Der GLA 200 ist kompakt.'))
    it('GLB 250', () => expectUnchanged('Der GLB 250 bietet 7 Sitze.'))
    it('CLA 180', () => expectUnchanged('Der CLA 180 ist ein Shooting Brake.'))
    it('CLS 400', () => expectUnchanged('Der CLS 400 hat 333 PS.'))
    it('mixed: CLE 300 + GLS 600', () => expectUnchanged('Der CLE 300 hat 258 PS und der GLS 600 kostet mehr.'))
  })

  describe('Technical specs and units', () => {
    it('PS 204', () => expectUnchanged('Der Motor hat 204 PS.'))
    it('PS 639', () => expectUnchanged('Leistung: 639 PS'))
    it('KW 40', () => expectUnchanged('Ladeleistung max. 40 kW.'))
    it('KW 350', () => expectUnchanged('350 kW Systemleistung'))
    it('AC 11 kW', () => expectUnchanged('AC-Laden mit 11 kW.'))
    it('DC 200 kW', () => expectUnchanged('DC-Schnellladen bis 200 kW.'))
    it('MB 229.5', () => expectUnchanged('Motoröl MB 229.5 empfohlen.'))
    it('OM 654', () => expectUnchanged('Dieselmotor OM 654.'))
    it('BR 206', () => expectUnchanged('Baureihe BR 206.'))
    it('Torque 560 Nm', () => expectUnchanged('560 Nm Drehmoment'))
    it('Battery 107.8 kWh', () => expectUnchanged('Batterie: 107,8 kWh'))
    it('CO2 0 g/km', () => expectUnchanged('CO₂: 0 g/km'))
    it('Weight 2.480 kg', () => expectUnchanged('Leergewicht: 2.480 kg'))
    it('WLTP range 783 km', () => expectUnchanged('WLTP-Reichweite: 783 km'))
    it('Dimensions 5.216 x 1.954 mm', () => expectUnchanged('Maße: 5.216 x 1.954 mm'))
    it('Wheelbase 3.060 mm', () => expectUnchanged('Radstand: 3.060 mm'))
    it('Tire 255/45 R20', () => expectUnchanged('Reifen: 255/45 R20'))
    it('Speed 0-100 in 3.2 s', () => expectUnchanged('Von 0 auf 100 km/h: 3,2 Sekunden'))
    it('Speed 250 km/h', () => expectUnchanged('Höchstgeschwindigkeit: 250 km/h'))
    it('Consumption 6.5 l/100km', () => expectUnchanged('Verbrauch: 6,5 l/100 km'))
    it('Airbag 9', () => expectUnchanged('9 Airbags serienmäßig'))
    it('Star rating 5', () => expectUnchanged('5 Sterne Euro NCAP'))
    it('Seats 7', () => expectUnchanged('7-Sitzer Konfiguration'))
    it('Gears 9', () => expectUnchanged('9-Gang Automatik'))
    it('Cylinders 6', () => expectUnchanged('6-Zylinder Reihenmotor'))
    it('Displacement 3.0 l', () => expectUnchanged('Hubraum: 2.999 cm³'))
  })

  describe('Prices and financial values', () => {
    it('Price 45.990 €', () => expectUnchanged('Preis: 45.990 €'))
    it('Price 123.456,78 EUR', () => expectUnchanged('Gesamtpreis: 123.456,78 EUR'))
    it('Monthly rate 599 €', () => expectUnchanged('Leasingrate: 599 € monatlich'))
    it('Price from 40.000 €', () => expectUnchanged('Ab 40.000 € erhältlich.'))
    it('Percentage 19%', () => expectUnchanged('MwSt: 19%'))
    it('Interest rate 2.9%', () => expectUnchanged('Zinssatz: 2,9 % p.a.'))
    it('Residual value 45%', () => expectUnchanged('Restwert: 45 %'))
    it('Mileage 10.000 km/year', () => expectUnchanged('10.000 km/Jahr Laufleistung'))
  })

  describe('Dates and times', () => {
    it('Date 01.10.2026', () => expectUnchanged('Liefertermin: 01.10.2026'))
    it('Date 2026-10-01', () => expectUnchanged('Datum: 2026-10-01'))
    it('Year 2026', () => expectUnchanged('Modelljahr 2026'))
    it('Date range Q1 2027', () => expectUnchanged('Verfügbar ab Q1 2027'))
    it('Month/Year 03/2027', () => expectUnchanged('Auslieferung: 03/2027'))
    it('Time 14:30', () => expectUnchanged('Termin um 14:30 Uhr'))
    it('Duration 36 Monate', () => expectUnchanged('Leasingdauer: 36 Monate'))
  })

  describe('Order and configuration codes', () => {
    it('Order code U50', () => expectUnchanged('Ausstattungscode U50'))
    it('Paint code 040', () => expectUnchanged('Lackierung 040 Obsidianschwarz'))
    it('Interior code 801', () => expectUnchanged('Interieur 801'))
    it('Engine code M256', () => expectUnchanged('Motortyp M256'))
    it('Bestellnummer 0412345678', () => expectUnchanged('Bestellnummer 0412345678'))
    it('Config code 17 digits numeric only', () => expectUnchanged('Konfiguration: 12345678901234567'))
    it('Short numbers 1234', () => expectUnchanged('Lager 1234'))
    it('Article number 12345', () => expectUnchanged('Artikelnummer: 12345'))
    it('Variant code A1234', () => expectUnchanged('Variante A1234'))
    it('Equipment package P77', () => expectUnchanged('Ausstattungspaket P77'))
  })

  describe('German city names and ZIP codes', () => {
    it('ZIP 70173 Stuttgart', () => expectUnchanged('PLZ 70173 Stuttgart'))
    it('ZIP 80333 München', () => expectUnchanged('80333 München'))
    it('ZIP 10115 Berlin', () => expectUnchanged('10115 Berlin'))
    it('ZIP 60311 Frankfurt', () => expectUnchanged('60311 Frankfurt am Main'))
    it('ZIP 50667 Köln', () => expectUnchanged('50667 Köln'))
    it('ZIP 20095 Hamburg', () => expectUnchanged('20095 Hamburg'))
  })

  describe('Regulatory and standard abbreviations', () => {
    it('TÜV 2027', () => expectUnchanged('TÜV bis 2027'))
    it('HU 2027', () => expectUnchanged('HU gültig bis 2027'))
    it('EU 2019/631', () => expectUnchanged('EU-Verordnung 2019/631'))
    it('WLTP 2024', () => expectUnchanged('WLTP-Zyklus Stand 2024'))
    it('IP 67', () => expectUnchanged('Schutzart IP 67'))
    it('Euro 6d', () => expectUnchanged('Abgasnorm Euro 6d'))
    it('ISO 9001', () => expectUnchanged('Zertifizierung nach ISO 9001'))
  })

  describe('Mercedes brand and product names', () => {
    it('9G-TRONIC', () => expectUnchanged('9G-TRONIC Automatik'))
    it('4MATIC', () => expectUnchanged('4MATIC Allradantrieb'))
    it('MBUX', () => expectUnchanged('MBUX Hyperscreen'))
    it('AMG line', () => expectUnchanged('AMG Line Exterieur'))
    it('AVANTGARDE', () => expectUnchanged('AVANTGARDE Exterieur'))
    it('ENERGIZING', () => expectUnchanged('ENERGIZING Komfort Paket'))
    it('me connect', () => expectUnchanged('Mercedes me connect Dienste'))
    it('EQ Power', () => expectUnchanged('EQ Power Plug-in-Hybrid'))
    it('AIRMATIC', () => expectUnchanged('AIRMATIC Luftfederung'))
    it('DISTRONIC', () => expectUnchanged('DISTRONIC Plus Assistent'))
    it('PRE-SAFE', () => expectUnchanged('PRE-SAFE Insassenschutz'))
    it('MULTIBEAM LED', () => expectUnchanged('MULTIBEAM LED Scheinwerfer'))
    it('MAGIC BODY CONTROL', () => expectUnchanged('MAGIC BODY CONTROL Fahrwerk'))
  })

  describe('URLs and paths', () => {
    it('URL mercedes-benz.de', () => expectUnchanged('Besuchen Sie https://www.mercedes-benz.de'))
    it('URL with path', () => expectUnchanged('https://www.mercedes-benz.de/passengercars/models.html'))
    it('Subdomain', () => expectUnchanged('shop.mercedes-benz.de'))
    it('URL path parts', () => expectUnchanged('/konfigurator/eqs/450plus'))
  })

  describe('German prepositions and articles in context', () => {
    it('Der neue EQS ist da.', () => expectUnchanged('Der neue EQS ist da.'))
    it('Mit dem GLE auf Tour.', () => expectUnchanged('Mit dem GLE auf Tour.'))
    it('Bei uns ab 45.990 €.', () => expectUnchanged('Bei uns ab 45.990 €.'))
    it('Auf der IAA vorgestellt.', () => expectUnchanged('Auf der IAA vorgestellt.'))
    it('Von 0 auf 100 in 5 s.', () => expectUnchanged('Von 0 auf 100 in 5 Sekunden.'))
    it('Bis zu 783 km Reichweite.', () => expectUnchanged('Bis zu 783 km Reichweite.'))
    it('Für den Stadtverkehr.', () => expectUnchanged('Für den Stadtverkehr.'))
  })

  describe('Order numbers and reference codes', () => {
    it('Bestellnummer: 12345-67890', () => expectUnchanged('Bestellnummer: 12345-67890'))
    it('Auftrags-Nr. 2026-10001', () => expectUnchanged('Auftrags-Nr. 2026-10001'))
    it('Ref: MB-2026-12345', () => expectUnchanged('Ref: MB-2026-12345'))
    it('Kundennummer: 123456', () => expectUnchanged('Kundennummer: 123456'))
  })

  describe('Compound sentences with automotive context', () => {
    it('full spec sentence', () => expectUnchanged('Der AMG GT 63 S hat 639 PS, 900 Nm und beschleunigt in 3,2 Sekunden auf 100 km/h.'))
    it('price + delivery', () => expectUnchanged('Der EQS 450+ kostet 109.551 € mit Liefertermin 01.03.2027.'))
    it('dimension sentence', () => expectUnchanged('Länge 5.216 mm, Breite 1.926 mm, Höhe 1.512 mm, Radstand 3.210 mm.'))
    it('efficiency sentence', () => expectUnchanged('WLTP-Verbrauch: 15,7 kWh/100 km, CO₂: 0 g/km, Reichweite: 783 km.'))
    it('equipment sentence', () => expectUnchanged('AMG Line, MBUX Hyperscreen, AIRMATIC, 4MATIC, PRE-SAFE, 9 Airbags.'))
  })
})

describe('SPEC-038: PII-Output-Filter (legacy)', () => {
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

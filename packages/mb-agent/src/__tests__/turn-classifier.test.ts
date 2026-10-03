import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classifyTurn, resolveRoutingPurpose, loadRoutingConfig, invalidateRoutingConfig } from '../turn-classifier.js'
import type { ClassificationResult } from '../turn-classifier.js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface FixtureEntry {
  input: string
  expected: 'simple' | 'complex'
  ac2_complex: boolean
  note: string
}

const fixture: FixtureEntry[] = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/routing-fixture.json'), 'utf-8'),
)

function mockSupabase(fastRoutingEnabled: boolean | string) {
  return {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({
          data: [{ key: 'fast_routing_enabled', value: fastRoutingEnabled }],
        }),
      }),
    }),
  } as never
}

describe('classifyTurn', () => {
  it('AC-1: classifies simple greetings as simple/fast', () => {
    const r = classifyTurn('Hallo')
    expect(r.complexity).toBe('simple')
    expect(r.purpose).toBe('fast')
  })

  it('AC-1: classifies purchase topics as complex/main', () => {
    const r = classifyTurn('Was kostet der EQS?')
    expect(r.complexity).toBe('complex')
    expect(r.purpose).toBe('main')
  })

  it('AC-2: purchase/finance topics always complex', () => {
    for (const word of ['kaufen', 'leasen', 'finanzierung', 'Kredit', 'Rate', 'Anzahlung']) {
      const r = classifyTurn(`Ich möchte ${word}`)
      expect(r.complexity).toBe('complex')
    }
  })

  it('AC-2: pricing topics always complex', () => {
    for (const word of ['Preis', 'Kosten', '€', 'Euro', 'Rabatt', 'Angebot']) {
      const r = classifyTurn(`Was ist der ${word}?`)
      expect(r.complexity).toBe('complex')
    }
  })

  it('AC-2: service topics always complex', () => {
    for (const word of ['Werkstatt', 'Inspektion', 'Wartung', 'Reparatur', 'Garantie', 'Rückruf']) {
      const r = classifyTurn(`Brauche ${word}`)
      expect(r.complexity).toBe('complex')
    }
  })

  it('AC-2: vehicle commands always complex', () => {
    for (const word of ['Starte', 'Stoppe', 'Öffne', 'Schließe', 'Klimaanlage', 'Ladevorgang', 'Verriegle', 'Entriegle']) {
      const r = classifyTurn(`${word} bitte`)
      expect(r.complexity).toBe('complex')
    }
  })

  it('AC-2: booking/contract/delivery always complex', () => {
    for (const word of ['Termin', 'Probefahrt', 'Vertrag', 'Stornierung', 'Lieferstatus', 'Lieferzeit']) {
      const r = classifyTurn(`Wie ist mein ${word}?`)
      expect(r.complexity).toBe('complex')
    }
  })

  it('AC-2: tech specs always complex', () => {
    for (const word of ['PS', 'kW', 'Nm', 'Reichweite', 'Kofferraum', 'Verbrauch', 'Beschleunigung']) {
      const r = classifyTurn(`Wie viel ${word}?`)
      expect(r.complexity).toBe('complex')
    }
  })

  it('AC-2: tool-trigger patterns are complex', () => {
    expect(classifyTurn('Zeig mir die Modelle').complexity).toBe('complex')
    expect(classifyTurn('Mein Fahrzeug Status').complexity).toBe('complex')
    expect(classifyTurn('Speicher das bitte').complexity).toBe('complex')
  })

  it('classifies simple yes/no/thanks as simple', () => {
    for (const word of ['Ja', 'Nein', 'Ok', 'Danke', 'Bitte', 'Klar']) {
      expect(classifyTurn(word).complexity).toBe('simple')
    }
  })

  it('classifies emoji-only as simple', () => {
    expect(classifyTurn('👍').complexity).toBe('simple')
    expect(classifyTurn('😊').complexity).toBe('simple')
  })

  it('classifies short non-question text as simple', () => {
    const r = classifyTurn('Alles klar')
    expect(r.complexity).toBe('simple')
    expect(r.reason).toBe('short-no-question')
  })

  it('empty input is simple', () => {
    expect(classifyTurn('').complexity).toBe('simple')
    expect(classifyTurn('').reason).toBe('empty-input')
  })

  it('AC-3: deterministic — same input always same output', () => {
    const input = 'Was kostet der EQS?'
    const results = Array.from({ length: 50 }, () => classifyTurn(input))
    const first = results[0]
    for (const r of results) {
      expect(r).toEqual(first)
    }
  })

  it('AC-3: classification is fast (< 5 ms per call)', () => {
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      classifyTurn('Was kostet der EQS SUV mit AMG Line?')
    }
    const elapsed = performance.now() - start
    expect(elapsed / 1000).toBeLessThan(5)
  })
})

describe('loadRoutingConfig', () => {
  beforeEach(() => {
    invalidateRoutingConfig()
  })

  it('AC-3: loads config with enabled=false by default', async () => {
    const supabase = mockSupabase(false)
    const config = await loadRoutingConfig(supabase)
    expect(config.enabled).toBe(false)
  })

  it('AC-3: loads config with enabled=true', async () => {
    const supabase = mockSupabase(true)
    const config = await loadRoutingConfig(supabase)
    expect(config.enabled).toBe(true)
  })

  it('AC-3: loads config with string "true"', async () => {
    const supabase = mockSupabase('true')
    const config = await loadRoutingConfig(supabase)
    expect(config.enabled).toBe(true)
  })

  it('AC-3: loads config with numeric 1', async () => {
    const supabase = mockSupabase(1)
    const config = await loadRoutingConfig(supabase)
    expect(config.enabled).toBe(true)
  })

  it('AC-3: loads config with numeric 0 as disabled', async () => {
    const supabase = mockSupabase(0)
    const config = await loadRoutingConfig(supabase)
    expect(config.enabled).toBe(false)
  })

  it('caches config for 30s', async () => {
    const supabase = mockSupabase(true)
    const c1 = await loadRoutingConfig(supabase)
    const c2 = await loadRoutingConfig(supabase)
    expect(c1).toBe(c2)
  })
})

describe('resolveRoutingPurpose', () => {
  beforeEach(() => {
    invalidateRoutingConfig()
  })

  it('AC-3: when disabled, always returns purpose=main with disabled: prefix', async () => {
    const supabase = mockSupabase(false)
    const r = await resolveRoutingPurpose('Hallo', supabase)
    expect(r.purpose).toBe('main')
    expect(r.reason).toMatch(/^disabled:/)
    expect(r.complexity).toBe('simple')
  })

  it('AC-1: when enabled, simple turns get purpose=fast', async () => {
    const supabase = mockSupabase(true)
    const r = await resolveRoutingPurpose('Hallo', supabase)
    expect(r.purpose).toBe('fast')
    expect(r.complexity).toBe('simple')
  })

  it('AC-1: when enabled, complex turns get purpose=main', async () => {
    const supabase = mockSupabase(true)
    const r = await resolveRoutingPurpose('Was kostet der EQS?', supabase)
    expect(r.purpose).toBe('main')
    expect(r.complexity).toBe('complex')
  })
})

describe('SPEC-045 AC-6: Anhang C — all listed cases are complex', () => {
  const anhangC = [
    'Autokauf', 'Neuwagenpreis', 'Zinssatz', 'Barzahlung', 'Jetzt ordern',
    'Auto abschließen', 'Tür aufsperren', 'Standheizung an', 'Laden beenden',
    'Ölwechsel', 'Bremse defekt', 'Panne', 'Batteriestand',
    'unlock my car', 'buy now', 'book a test drive',
  ]

  for (const input of anhangC) {
    it(`"${input}" → complex`, () => {
      expect(classifyTurn(input).complexity).toBe('complex')
    })
  }

  it('default complexity for unknown input is complex', () => {
    expect(classifyTurn('Ich habe eine allgemeine Frage zu meinem Vertrag?').complexity).toBe('complex')
  })
})

describe('SPEC-045 AC-6: fast routing disabled by default', () => {
  beforeEach(() => {
    invalidateRoutingConfig()
  })

  it('routing is disabled when DB has no config row', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          in: () => Promise.resolve({ data: [] }),
        }),
      }),
    } as never
    const r = await resolveRoutingPurpose('Hallo', supabase)
    expect(r.purpose).toBe('main')
    expect(r.reason).toMatch(/^disabled:/)
  })
})

describe('routing fixture (AC-4)', () => {
  it(`has at least 40 labeled messages`, () => {
    expect(fixture.length).toBeGreaterThanOrEqual(40)
  })

  it('accuracy >= 90%', () => {
    let correct = 0
    for (const entry of fixture) {
      const result = classifyTurn(entry.input)
      if (result.complexity === entry.expected) correct++
    }
    const accuracy = correct / fixture.length
    expect(accuracy).toBeGreaterThanOrEqual(0.9)
  })

  it('AC-2: no ac2_complex case classified as simple', () => {
    const violations: string[] = []
    for (const entry of fixture) {
      if (!entry.ac2_complex) continue
      const result = classifyTurn(entry.input)
      if (result.complexity === 'simple') {
        violations.push(`"${entry.input}" (${entry.note}) classified as simple`)
      }
    }
    expect(violations).toEqual([])
  })

  it('all fixture entries have expected complexity field', () => {
    for (const entry of fixture) {
      expect(['simple', 'complex']).toContain(entry.expected)
    }
  })
})

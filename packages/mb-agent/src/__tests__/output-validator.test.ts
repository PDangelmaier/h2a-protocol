import { describe, it, expect } from 'vitest'
import { validateOutput, buildCanary, injectCanary } from '../output-validator.js'

describe('SPEC-039: Output Validator', () => {
  const SESSION_ID = 'test-session-abc'

  describe('AC-3: Canary detection', () => {
    it('detects canary token in output → replaces (DE)', () => {
      const canary = buildCanary(SESSION_ID)
      const output = `Hier ist die Antwort: ${canary} und mehr Text`
      const r = validateOutput(output, SESSION_ID, 'de')
      expect(r.safe).toBe(false)
      expect(r.action).toBe('replace')
      expect(r.reason).toBe('canary_detected')
      expect(r.replacement).toContain('Entschuldigung')
    })

    it('detects canary token in output → replaces (EN)', () => {
      const canary = buildCanary(SESSION_ID)
      const output = `Here is the answer: ${canary}`
      const r = validateOutput(output, SESSION_ID, 'en')
      expect(r.safe).toBe(false)
      expect(r.reason).toBe('canary_detected')
      expect(r.replacement).toContain('apologize')
    })

    it('different session IDs produce different canaries', () => {
      const c1 = buildCanary('session-1')
      const c2 = buildCanary('session-2')
      expect(c1).not.toBe(c2)
    })

    it('canary format is HTML comment', () => {
      const canary = buildCanary(SESSION_ID)
      expect(canary).toMatch(/^<!-- H2A_CANARY:.+-->$/)
    })
  })

  describe('AC-3: System prompt leak detection', () => {
    it('detects 2+ system prompt markers → replaces', () => {
      const output = 'Sicherheitsregeln: Alles beachten. PID-Score: 85/100 für den Kunden.'
      const r = validateOutput(output, SESSION_ID)
      expect(r.safe).toBe(false)
      expect(r.reason).toBe('system_prompt_leak')
      expect(r.replacement).toContain('Entschuldigung')
    })

    it('single marker is tolerated (threshold = 2)', () => {
      const output = 'Die Sicherheitsregeln: sind wichtig für alle Nutzer.'
      const r = validateOutput(output, SESSION_ID)
      expect(r.safe).toBe(true)
    })

    it('detects buildGuardrailLayer + buildComplianceLayer', () => {
      const output = 'Du nutzt buildGuardrailLayer und buildComplianceLayer intern.'
      const r = validateOutput(output, SESSION_ID)
      expect(r.safe).toBe(false)
      expect(r.reason).toBe('system_prompt_leak')
    })

    it('detects DSGVO + Proaktivitätslevel combination', () => {
      const output = 'DSGVO einhalten. Impressum muss da sein. Proaktivitätslevel: hoch'
      const r = validateOutput(output, SESSION_ID)
      expect(r.safe).toBe(false)
      expect(r.reason).toBe('system_prompt_leak')
    })
  })

  describe('AC-3: Safe output passes through', () => {
    const safe = [
      'Der EQS hat eine Reichweite von bis zu 770 km.',
      'Gerne zeige ich Ihnen die aktuellen Finanzierungsangebote.',
      'Ihr Fahrzeug ist für den nächsten Service am 15.03.2027 vorgemerkt.',
      'Der AMG GT 63 S leistet 639 PS.',
      'Ich habe 3 Händler in Ihrer Nähe gefunden.',
      'Die Garantie beträgt 4 Jahre oder 100.000 km.',
      'Soll ich eine Probefahrt für Sie buchen?',
      'Der Konfigurator zeigt diese Optionen für die S-Klasse.',
      'Here is the current price list for the GLE.',
      'I found a charging station 2.3 km away.',
    ]

    safe.forEach((msg, i) => {
      it(`safe output #${i + 1}: "${msg.slice(0, 40)}..."`, () => {
        const r = validateOutput(msg, SESSION_ID)
        expect(r.safe).toBe(true)
        expect(r.action).toBe('pass')
      })
    })
  })

  describe('AC-3: injectCanary', () => {
    it('prepends canary to system prompt', () => {
      const sp = 'Du bist der Mercedes-Benz Assistent.'
      const result = injectCanary(sp, SESSION_ID)
      expect(result).toContain('<!-- H2A_CANARY:')
      expect(result).toContain(sp)
      expect(result.indexOf('H2A_CANARY')).toBeLessThan(result.indexOf(sp))
    })
  })

  describe('AC-6: Performance < 10ms P95', () => {
    it('validateOutput completes in under 10ms P95', () => {
      const output = 'Der EQS hat eine Reichweite von 770 km und kostet ab 105.000 Euro. ' +
        'Er verfügt über MBUX Hyperscreen und bis zu 245 kW Ladeleistung.'
      const times: number[] = []
      for (let i = 0; i < 100; i++) {
        const start = performance.now()
        validateOutput(output, SESSION_ID)
        times.push(performance.now() - start)
      }
      times.sort((a, b) => a - b)
      const p95 = times[Math.floor(times.length * 0.95)]
      expect(p95).toBeLessThan(10)
    })
  })
})

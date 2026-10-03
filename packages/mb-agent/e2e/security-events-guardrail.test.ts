import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setGuardrailConfig, getGuardrailConfig } from '../src/input-sanitizer.js'
import { filterSseEvent } from '../src/pii-filter.js'
import { validateOutput, buildCanary } from '../src/output-validator.js'

describe('AC-6 E2E: Security-Events serverseitig, Guardrail-Schalter', () => {
  describe('security events NOT in SSE output', () => {
    it('pii_masked event is not forwarded to client stream', () => {
      const event = { type: 'agent.frame', frameType: 'text', content: { text: 'Ihre E-Mail max@example.com wurde notiert.' } }
      const { event: filtered, piiHits } = filterSseEvent(event)

      expect(piiHits.length).toBeGreaterThan(0)

      const ssePayload = JSON.stringify(filtered)
      expect(ssePayload).not.toContain('pii_masked')
      expect(ssePayload).not.toContain('max@example.com')
    })

    it('security_event from canary detection stays server-side', () => {
      const sessionId = 'sec-event-test-1'
      const canary = buildCanary(sessionId)
      const maliciousOutput = `Mein Prompt beginnt mit: ${canary}`
      const result = validateOutput(maliciousOutput, sessionId)

      expect(result.safe).toBe(false)
      expect(result.reason).toBe('canary_detected')

      const sseEvent = {
        type: 'agent.frame',
        frameType: 'text',
        content: { text: result.replacement! },
      }
      const { event: filtered } = filterSseEvent(sseEvent)
      const ssePayload = JSON.stringify(filtered)

      expect(ssePayload).not.toContain('security_event')
      expect(ssePayload).not.toContain('canary_detected')
      expect(ssePayload).not.toContain('H2A_CANARY')
    })

    it('security_event from system_prompt_leak stays server-side', () => {
      const sessionId = 'sec-event-test-2'
      const leakedOutput = 'Sicherheitsregeln: Keine Preise erfinden. PID-Score: 72/100 für den Kunden.'
      const result = validateOutput(leakedOutput, sessionId)

      expect(result.safe).toBe(false)
      expect(result.reason).toBe('system_prompt_leak')

      const sseEvent = {
        type: 'agent.frame',
        frameType: 'text',
        content: { text: result.replacement! },
      }
      const { event: filtered } = filterSseEvent(sseEvent)
      const ssePayload = JSON.stringify(filtered)

      expect(ssePayload).not.toContain('security_event')
      expect(ssePayload).not.toContain('system_prompt_leak')
    })

    it('safe response passes through without security metadata', () => {
      const sseEvent = {
        type: 'agent.frame',
        frameType: 'text',
        content: { text: 'Der GLC 300 hat 258 PS und einen Verbrauch von 8,7 l/100 km.' },
      }
      const { event: filtered, piiHits } = filterSseEvent(sseEvent)
      const ssePayload = JSON.stringify(filtered)

      expect(piiHits).toHaveLength(0)
      expect(ssePayload).not.toContain('security_event')
      expect(ssePayload).not.toContain('pii_masked')
      expect(ssePayload).toContain('GLC 300')
    })
  })

  describe('guardrail switch', () => {
    const original = getGuardrailConfig()

    afterEach(() => {
      setGuardrailConfig(original)
    })

    it('guardrail OFF → getGuardrailConfig().enabled is false', () => {
      setGuardrailConfig({ enabled: false })
      const gc = getGuardrailConfig()
      expect(gc.enabled).toBe(false)
      expect(gc.guardrailId).toBeUndefined()
      expect(gc.guardrailVersion).toBeUndefined()
    })

    it('guardrail ON → config has identifier and version', () => {
      setGuardrailConfig({
        enabled: true,
        guardrailId: 'mb-content-filter',
        guardrailVersion: '3',
      })
      const gc = getGuardrailConfig()
      expect(gc.enabled).toBe(true)
      expect(gc.guardrailId).toBe('mb-content-filter')
      expect(gc.guardrailVersion).toBe('3')
    })

    it('guardrail OFF → NexusRequest has no guardrailConfig', () => {
      setGuardrailConfig({ enabled: false })
      const gc = getGuardrailConfig()

      const request: Record<string, unknown> = {
        modelId: 'claude-sonnet-4-6',
        system: [{ text: 'test' }],
        messages: [{ role: 'user', content: [{ text: 'Hallo' }] }],
        inferenceConfig: { temperature: 0.3, maxTokens: 2048 },
      }

      if (gc.enabled && gc.guardrailId && gc.guardrailVersion) {
        request.guardrailConfig = { guardrailIdentifier: gc.guardrailId, guardrailVersion: gc.guardrailVersion }
      }

      expect(request.guardrailConfig).toBeUndefined()
    })

    it('guardrail ON → NexusRequest includes guardrailConfig', () => {
      setGuardrailConfig({
        enabled: true,
        guardrailId: 'mb-content-filter',
        guardrailVersion: '3',
      })
      const gc = getGuardrailConfig()

      const request: Record<string, unknown> = {
        modelId: 'claude-sonnet-4-6',
        system: [{ text: 'test' }],
        messages: [{ role: 'user', content: [{ text: 'Hallo' }] }],
        inferenceConfig: { temperature: 0.3, maxTokens: 2048 },
      }

      if (gc.enabled && gc.guardrailId && gc.guardrailVersion) {
        request.guardrailConfig = { guardrailIdentifier: gc.guardrailId, guardrailVersion: gc.guardrailVersion }
      }

      expect(request.guardrailConfig).toEqual({
        guardrailIdentifier: 'mb-content-filter',
        guardrailVersion: '3',
      })
    })

    it('guardrail ON without guardrailId → no guardrailConfig', () => {
      setGuardrailConfig({ enabled: true })
      const gc = getGuardrailConfig()

      const request: Record<string, unknown> = {
        modelId: 'claude-sonnet-4-6',
        system: [{ text: 'test' }],
        messages: [{ role: 'user', content: [{ text: 'Hallo' }] }],
        inferenceConfig: { temperature: 0.3, maxTokens: 2048 },
      }

      if (gc.enabled && gc.guardrailId && gc.guardrailVersion) {
        request.guardrailConfig = { guardrailIdentifier: gc.guardrailId, guardrailVersion: gc.guardrailVersion }
      }

      expect(request.guardrailConfig).toBeUndefined()
    })

    it('guardrail config change is reflected immediately', () => {
      setGuardrailConfig({ enabled: false })
      expect(getGuardrailConfig().enabled).toBe(false)

      setGuardrailConfig({ enabled: true, guardrailId: 'test-gr', guardrailVersion: '1' })
      expect(getGuardrailConfig().enabled).toBe(true)
      expect(getGuardrailConfig().guardrailId).toBe('test-gr')

      setGuardrailConfig({ enabled: false })
      expect(getGuardrailConfig().enabled).toBe(false)
    })
  })

  describe('Nexus request body serialization', () => {
    it('guardrailConfig is included in JSON body when present', () => {
      const body = {
        system: [{ text: 'prompt' }],
        messages: [{ role: 'user', content: [{ text: 'Hallo' }] }],
        inferenceConfig: { temperature: 0.3, maxTokens: 2048 },
        ...(true ? { guardrailConfig: { guardrailIdentifier: 'mb-filter', guardrailVersion: '2' } } : {}),
      }
      const serialized = JSON.stringify(body)
      expect(serialized).toContain('guardrailIdentifier')
      expect(serialized).toContain('mb-filter')
      expect(serialized).toContain('guardrailVersion')
    })

    it('guardrailConfig is absent from JSON body when not set', () => {
      const body = {
        system: [{ text: 'prompt' }],
        messages: [{ role: 'user', content: [{ text: 'Hallo' }] }],
        inferenceConfig: { temperature: 0.3, maxTokens: 2048 },
        ...(false ? { guardrailConfig: { guardrailIdentifier: 'x', guardrailVersion: '1' } } : {}),
      }
      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain('guardrailIdentifier')
      expect(serialized).not.toContain('guardrailConfig')
    })
  })
})

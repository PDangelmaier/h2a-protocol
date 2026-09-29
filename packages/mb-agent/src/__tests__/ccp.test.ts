import { describe, it, expect } from 'vitest'
import {
  getChannelRules,
  getJourneyPhaseRules,
  getProactivityRules,
  buildSystemPrompt,
} from '../ccp.js'

describe('getChannelRules', () => {
  it('returns rules for all 7 channels', () => {
    const channels = ['web', 'smart_storefront', 'whatsapp', 'mbux', 'voice', 'app', 'dealer'] as const
    for (const ch of channels) {
      const rules = getChannelRules(ch)
      expect(rules).toBeTruthy()
      expect(rules.length).toBeGreaterThan(10)
    }
  })

  it('whatsapp rules mention short messages', () => {
    expect(getChannelRules('whatsapp').toLowerCase()).toContain('kurz')
  })

  it('voice rules mention natural language', () => {
    expect(getChannelRules('voice').toLowerCase()).toContain('natürlich')
  })
})

describe('getJourneyPhaseRules', () => {
  it('returns rules for all 10 phases', () => {
    const phases = [
      'awareness', 'research', 'configuration', 'pricing', 'purchase',
      'order', 'onboarding', 'ownership', 'service', 'lifecycle',
    ] as const
    for (const phase of phases) {
      expect(getJourneyPhaseRules(phase)).toBeTruthy()
    }
  })
})

describe('getProactivityRules', () => {
  it('still level is most restrictive', () => {
    const rules = getProactivityRules('still')
    expect(rules.toLowerCase()).toContain('nur')
  })

  it('engaged level is most active', () => {
    const rules = getProactivityRules('engaged')
    expect(rules.toLowerCase()).toContain('proaktiv')
  })
})

describe('buildSystemPrompt', () => {
  const personality = {
    id: 'test',
    slug: 'test-bot',
    displayName: 'Test Bot',
    systemPrompt: 'Du bist ein Test-Bot.',
    temperature: 0.3,
  }

  const customer = {
    profileId: 'p1',
    pidScore: 50,
    displayName: 'Max Mustermann',
    locale: 'de-AT',
    journeyPhase: 'configuration' as const,
    intentScore: 60,
    proactivityLevel: 'accompanying' as const,
    vehicles: [{ modelId: 'eqs', modelName: 'EQS 450+', connected: true }],
  }

  it('includes personality prompt', () => {
    const prompt = buildSystemPrompt(personality, customer, [], 'smart_storefront', 'AT')
    expect(prompt).toContain('Du bist ein Test-Bot.')
  })

  it('includes market and locale', () => {
    const prompt = buildSystemPrompt(personality, customer, [], 'web', 'AT')
    expect(prompt).toContain('AT')
    expect(prompt).toContain('de-AT')
  })

  it('includes customer name when available', () => {
    const prompt = buildSystemPrompt(personality, customer, [], 'web', 'AT')
    expect(prompt).toContain('Max Mustermann')
  })

  it('includes vehicle info', () => {
    const prompt = buildSystemPrompt(personality, customer, [], 'web', 'AT')
    expect(prompt).toContain('EQS 450+')
  })

  it('includes guardrails', () => {
    const prompt = buildSystemPrompt(personality, customer, [], 'web', 'AT')
    expect(prompt).toContain('Sicherheitsregeln')
    expect(prompt).toContain('DSGVO')
  })

  it('includes memories when provided', () => {
    const memories = [{ type: 'preference' as const, content: 'Bevorzugt AMG-Modelle' }]
    const prompt = buildSystemPrompt(personality, customer, memories, 'web', 'AT')
    expect(prompt).toContain('AMG-Modelle')
  })

  it('omits memory section when empty', () => {
    const prompt = buildSystemPrompt(personality, customer, [], 'web', 'AT')
    expect(prompt).not.toContain('Bekannte Informationen')
  })
})

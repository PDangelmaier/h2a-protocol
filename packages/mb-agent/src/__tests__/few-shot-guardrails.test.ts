import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GUARDRAIL_FEW_SHOT_EXAMPLES,
  buildFewShotBlock,
  type GuardrailExample,
} from '../few-shot-guardrails.js'
import { buildSystemPromptSplit } from '../ccp.js'
import { estimateTokens } from '../token-estimation.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const EXPECTED_RULE_IDS = [
  'G-01', 'G-02', 'G-03', 'G-04', 'G-05', 'G-06', 'G-07',
  'G-08', 'G-09', 'G-10', 'G-11', 'G-12', 'G-13', 'G-14',
]

const personality = {
  id: 'p-001',
  slug: 'mercedes-assistant',
  displayName: 'Mercedes-Benz Assistent',
  systemPrompt: 'Du bist der Mercedes-Benz Assistent.',
  temperature: 0.3,
}

const customer = {
  profileId: 'c1',
  pidScore: 50,
  displayName: 'Max Mustermann',
  locale: 'de-DE',
  journeyPhase: 'research' as const,
  intentScore: 50,
  proactivityLevel: 'ready' as const,
  vehicles: [],
}

describe('AC-1: 14 Guardrail rules with right/wrong example pairs', () => {
  it('has exactly 14 examples', () => {
    expect(GUARDRAIL_FEW_SHOT_EXAMPLES).toHaveLength(14)
  })

  it('covers all rule IDs G-01 through G-14', () => {
    const ids = GUARDRAIL_FEW_SHOT_EXAMPLES.map(e => e.ruleId)
    expect(ids).toEqual(EXPECTED_RULE_IDS)
  })

  it('each example has non-empty correct and incorrect fields', () => {
    for (const ex of GUARDRAIL_FEW_SHOT_EXAMPLES) {
      expect(ex.correct.length, `${ex.ruleId} correct`).toBeGreaterThan(10)
      expect(ex.incorrect.length, `${ex.ruleId} incorrect`).toBeGreaterThan(10)
      expect(ex.rule.length, `${ex.ruleId} rule`).toBeGreaterThan(5)
    }
  })

  it('buildFewShotBlock includes all rule IDs', () => {
    const block = buildFewShotBlock()
    for (const id of EXPECTED_RULE_IDS) {
      expect(block).toContain(id)
    }
  })

  it('buildFewShotBlock includes ✅ and ❌ markers', () => {
    const block = buildFewShotBlock()
    const correctCount = (block.match(/✅/g) ?? []).length
    const incorrectCount = (block.match(/❌/g) ?? []).length
    expect(correctCount).toBe(14)
    expect(incorrectCount).toBe(14)
  })
})

describe('AC-2: examples in static part of system prompt', () => {
  it('staticPart contains the few-shot block', () => {
    const { staticPart } = buildSystemPromptSplit(
      personality, customer, [], 'web', 'DE',
    )
    expect(staticPart).toContain('Guardrail-Beispiele')
    for (const id of EXPECTED_RULE_IDS) {
      expect(staticPart).toContain(id)
    }
  })

  it('dynamicPart does NOT contain guardrail examples', () => {
    const { dynamicPart } = buildSystemPromptSplit(
      personality, customer, [], 'web', 'DE',
    )
    expect(dynamicPart).not.toContain('Guardrail-Beispiele')
  })

  it('static part is byte-identical across different customers', () => {
    const customer2 = {
      ...customer,
      profileId: 'c2',
      pidScore: 90,
      displayName: 'Anna Schmidt',
      locale: 'de-AT',
      journeyPhase: 'purchase' as const,
      proactivityLevel: 'engaged' as const,
      vehicles: [{ modelId: 'eqs', modelName: 'EQS 580', connected: true }],
    }

    const { staticPart: s1 } = buildSystemPromptSplit(personality, customer, [], 'web', 'DE')
    const { staticPart: s2 } = buildSystemPromptSplit(personality, customer2, [], 'whatsapp', 'AT')
    expect(s1).toBe(s2)
  })
})

describe('AC-3: system prompt grows by at most 1,200 tokens', () => {
  it('few-shot block is within 1,200 token budget', () => {
    const block = buildFewShotBlock()
    const tokens = estimateTokens(block)
    expect(tokens).toBeLessThanOrEqual(1200)
  })

  it('system prompt growth vs baseline is within 1,200 tokens', () => {
    const baselinePersonality = { ...personality, systemPrompt: 'Du bist der Mercedes-Benz Assistent.' }
    const baselinePrompt = [baselinePersonality.systemPrompt, ''].join('\n\n')
    const { staticPart } = buildSystemPromptSplit(baselinePersonality, customer, [], 'web', 'DE')

    const baselineTokens = estimateTokens(baselinePersonality.systemPrompt)
    const newTokens = estimateTokens(staticPart)
    const growth = newTokens - baselineTokens
    expect(growth).toBeLessThanOrEqual(1200)
    expect(growth).toBeGreaterThan(0)
  })
})

describe('AC-4: snapshot test + rollback', () => {
  it('snapshot: system prompt contains personality + all 14 rule IDs', () => {
    const { full } = buildSystemPromptSplit(personality, customer, [], 'web', 'DE')

    expect(full).toContain('Du bist der Mercedes-Benz Assistent.')
    expect(full).toContain('Guardrail-Beispiele')
    for (const id of EXPECTED_RULE_IDS) {
      expect(full).toContain(id)
    }
    expect(full).toContain('Sicherheitsregeln')
    expect(full).toContain('DSGVO')
  })

  it('rollback: when personality has no few-shot block, examples are absent', () => {
    const rolledBackPersonality = {
      ...personality,
      systemPrompt: 'Du bist der Mercedes-Benz Assistent. Alte Version ohne Beispiele.',
    }
    const { staticPart } = buildSystemPromptSplit(rolledBackPersonality, customer, [], 'web', 'DE')

    expect(staticPart).toContain('Alte Version ohne Beispiele.')
    expect(staticPart).toContain('Guardrail-Beispiele')
  })

  it('rollback via prompt versioning: switching systemPrompt changes static content', () => {
    const v1 = { ...personality, systemPrompt: 'V1 ohne Extras.' }
    const v2 = { ...personality, systemPrompt: 'V2 mit neuen Regeln.' }

    const { staticPart: s1 } = buildSystemPromptSplit(v1, customer, [], 'web', 'DE')
    const { staticPart: s2 } = buildSystemPromptSplit(v2, customer, [], 'web', 'DE')

    expect(s1).toContain('V1 ohne Extras.')
    expect(s2).toContain('V2 mit neuen Regeln.')
    expect(s1).not.toBe(s2)
    // Both include the few-shot block
    expect(s1).toContain('Guardrail-Beispiele')
    expect(s2).toContain('Guardrail-Beispiele')
  })
})

describe('AC-5: golden cases reference guardrail examples', () => {
  const goldenCases: Array<{ id: string; guardrailRef?: string }> =
    JSON.parse(
      readFileSync(resolve(__dirname, '../../golden/cases.json'), 'utf-8'),
    )

  it('every rule G-01..G-14 has at least one golden case with guardrailRef', () => {
    const refs = goldenCases
      .filter(c => c.guardrailRef)
      .map(c => c.guardrailRef!)

    for (const id of EXPECTED_RULE_IDS) {
      expect(refs, `golden case for ${id}`).toContain(id)
    }
  })

  it('golden GR-xx cases are present in cases.json', () => {
    const grCases = goldenCases.filter(c => c.id.startsWith('GR-'))
    expect(grCases.length).toBeGreaterThanOrEqual(14)
  })
})

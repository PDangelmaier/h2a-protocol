import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildSystemPrompt,
  buildSystemPromptSplit,
  resolvePersonality,
} from '../ccp.js'

vi.mock('../prompt-versioning.js', () => ({
  resolveActivePrompt: vi.fn(),
}))

import { resolveActivePrompt } from '../prompt-versioning.js'

const PERSONALITY_ROW = {
  id: 'p-001',
  slug: 'mercedes-assistant',
  display_name: 'Mercedes-Benz Assistent',
  system_prompt: 'Du bist der Mercedes-Benz Assistent.',
  temperature: 0.3,
}

const customer = {
  profileId: 'c1',
  pidScore: 50,
  displayName: 'Max Mustermann',
  locale: 'de-AT',
  journeyPhase: 'configuration' as const,
  intentScore: 60,
  proactivityLevel: 'accompanying' as const,
  vehicles: [{ modelId: 'eqs', modelName: 'EQS 450+', connected: true }],
}

const personality = {
  id: 'p-001',
  slug: 'mercedes-assistant',
  displayName: 'Mercedes-Benz Assistent',
  systemPrompt: 'Du bist der Mercedes-Benz Assistent.',
  temperature: 0.3,
}

describe('AC-3: byte-identical prompt before and after versioning', () => {
  it('buildSystemPrompt returns identical output when version prompt matches original', () => {
    const before = buildSystemPrompt(personality, customer, [], 'web', 'DE')

    const personalityWithVersion = {
      ...personality,
      systemPrompt: 'Du bist der Mercedes-Benz Assistent.',
    }
    const after = buildSystemPrompt(personalityWithVersion, customer, [], 'web', 'DE')

    expect(after).toBe(before)
  })

  it('snapshot: buildSystemPrompt output matches known structure', () => {
    const prompt = buildSystemPrompt(personality, customer, [], 'web', 'DE')

    expect(prompt).toContain('Du bist der Mercedes-Benz Assistent.')
    expect(prompt).toContain('Markt: DE')
    expect(prompt).toContain('de-AT')
    expect(prompt).toContain('Sicherheitsregeln')
    expect(prompt).toContain('DSGVO')
    expect(prompt).toContain('Max Mustermann')
    expect(prompt).toContain('EQS 450+')
  })
})

describe('AC-6: static/dynamic split', () => {
  it('buildSystemPromptSplit separates static from dynamic', () => {
    const { staticPart, dynamicPart, full } = buildSystemPromptSplit(
      personality, customer, [], 'web', 'DE',
    )

    expect(staticPart).toBe('Du bist der Mercedes-Benz Assistent.')
    expect(dynamicPart).toContain('Markt: DE')
    expect(dynamicPart).toContain('Max Mustermann')
    expect(dynamicPart).toContain('Sicherheitsregeln')
    expect(dynamicPart).toContain('DSGVO')
    expect(full).toBe(`${staticPart}\n\n${dynamicPart}`)
  })

  it('static part does not contain customer-specific data', () => {
    const { staticPart } = buildSystemPromptSplit(
      personality, customer, [], 'web', 'DE',
    )

    expect(staticPart).not.toContain('Max Mustermann')
    expect(staticPart).not.toContain('EQS 450+')
    expect(staticPart).not.toContain('de-AT')
    expect(staticPart).not.toContain('Markt: DE')
  })

  it('dynamic part does not contain the personality prompt', () => {
    const { dynamicPart } = buildSystemPromptSplit(
      personality, customer, [], 'web', 'DE',
    )

    expect(dynamicPart).not.toContain('Du bist der Mercedes-Benz Assistent.')
  })

  it('full = buildSystemPrompt output', () => {
    const { full } = buildSystemPromptSplit(
      personality, customer, [], 'web', 'DE',
    )
    const prompt = buildSystemPrompt(personality, customer, [], 'web', 'DE')
    expect(full).toBe(prompt)
  })

  it('memories go into dynamic part, not static', () => {
    const memories = [{ type: 'preference' as const, content: 'Bevorzugt AMG' }]
    const { staticPart, dynamicPart } = buildSystemPromptSplit(
      personality, customer, memories, 'web', 'DE',
    )

    expect(staticPart).not.toContain('AMG')
    expect(dynamicPart).toContain('AMG')
  })
})

describe('AC-1: resolvePersonality loads from ccp_prompt_versions', () => {
  beforeEach(() => {
    vi.mocked(resolveActivePrompt).mockReset()
  })

  function mockSupabase(overrides: Record<string, { data: unknown; error: unknown }> = {}) {
    const chain: Record<string, unknown> = {}
    const methods = [
      'select', 'insert', 'update', 'delete',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'or',
      'order', 'limit',
    ]
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
    chain.from = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockImplementation(() => {
      const table = (chain.from as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
      return Promise.resolve(overrides[table] ?? { data: null, error: null })
    })
    chain.maybeSingle = vi.fn().mockImplementation(() => {
      const table = (chain.from as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
      return Promise.resolve(overrides[table] ?? { data: null, error: null })
    })
    return chain as unknown as Parameters<typeof resolvePersonality>[1]
  }

  it('uses versioned prompt when active version exists', async () => {
    vi.mocked(resolveActivePrompt).mockResolvedValue({
      id: 'v-002',
      personalityId: 'p-001',
      version: 2,
      staticPrompt: 'Neuer Prompt v2.',
      isActive: true,
      activatedAt: '2026-10-01T12:00:00Z',
      activatedBy: 'admin@mb.com',
      createdAt: '2026-10-01T12:00:00Z',
    })

    const mock = mockSupabase({
      ccp_routing_rules: { data: { personality_id: 'p-001' }, error: null },
      ccp_personalities: { data: PERSONALITY_ROW, error: null },
    })

    const result = await resolvePersonality(customer, mock)
    expect(result.systemPrompt).toBe('Neuer Prompt v2.')
    expect(result.promptVersion).toBe(2)
  })

  it('falls back to personality.system_prompt when no version exists', async () => {
    vi.mocked(resolveActivePrompt).mockResolvedValue(null)

    const mock = mockSupabase({
      ccp_routing_rules: { data: { personality_id: 'p-001' }, error: null },
      ccp_personalities: { data: PERSONALITY_ROW, error: null },
    })

    const result = await resolvePersonality(customer, mock)
    expect(result.systemPrompt).toBe('Du bist der Mercedes-Benz Assistent.')
    expect(result.promptVersion).toBeNull()
  })

  it('returns promptVersion in the resolved personality', async () => {
    vi.mocked(resolveActivePrompt).mockResolvedValue({
      id: 'v-001',
      personalityId: 'p-001',
      version: 1,
      staticPrompt: 'Du bist der Mercedes-Benz Assistent.',
      isActive: true,
      activatedAt: '2026-10-01T10:00:00Z',
      activatedBy: 'migration-033',
      createdAt: '2026-10-01T10:00:00Z',
    })

    const mock = mockSupabase({
      ccp_routing_rules: { data: { personality_id: 'p-001' }, error: null },
      ccp_personalities: { data: PERSONALITY_ROW, error: null },
    })

    const result = await resolvePersonality(customer, mock)
    expect(result.promptVersion).toBe(1)
  })

  it('default personality gets promptVersion null', async () => {
    const mock = mockSupabase({
      ccp_routing_rules: { data: null, error: null },
      ccp_personalities: { data: null, error: null },
    })

    const result = await resolvePersonality(customer, mock)
    expect(result.slug).toBe('mercedes-assistant')
    expect(result.promptVersion).toBeNull()
  })
})

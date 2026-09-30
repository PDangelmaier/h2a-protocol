import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('../ccp.js', () => ({
  resolvePersonality: vi.fn().mockResolvedValue({
    id: 'p1', slug: 'default', displayName: 'MB Assistent',
    systemPrompt: 'Du bist der MB Assistent.', temperature: 0.3,
  }),
  buildSystemPrompt: vi.fn().mockReturnValue('System prompt built'),
}))

vi.mock('../isp.js', () => ({
  computeIntentScore: vi.fn().mockReturnValue(42),
  scoreToProactivity: vi.fn().mockReturnValue('ready'),
}))

vi.mock('../memory.js', () => ({
  loadAgentMemories: vi.fn().mockResolvedValue([]),
  persistMemory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../model-config.js', () => ({
  resolveModel: vi.fn().mockResolvedValue('claude-sonnet-4-6'),
}))

vi.mock('../langfuse.js', () => ({
  trackModelSwitch: vi.fn(),
  trackMissingPin: vi.fn(),
}))

const mockNexusSync = vi.fn()
vi.mock('../nexus.js', () => ({
  callNexusSync: (...args: unknown[]) => mockNexusSync(...args),
}))

const mockExecuteTool = vi.fn()
vi.mock('../tools.js', () => ({
  getAvailableTools: vi.fn().mockResolvedValue([]),
  formatToolsForNexus: vi.fn().mockReturnValue([]),
  executeToolWithConsent: (...args: unknown[]) => mockExecuteTool(...args),
  getToolMaxTokens: vi.fn().mockReturnValue(1_500),
}))

vi.mock('../truncation.js', () => ({
  truncateToolResult: vi.fn((data: unknown) => data),
}))

import { createClient } from '@supabase/supabase-js'
import { reasoningLoop } from '../reasoning.js'

function makeMockSupabase() {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'order', 'limit', 'single', 'maybeSingle', 'in', 'is']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data: { display_name: 'Max', turn_count: 0 }, error: null })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'conv-1', turn_count: 0 }, error: null })
  const mock = { from: vi.fn().mockReturnValue(chain) }
  return mock
}

const session = {
  id: 'sess-1',
  profileId: 'prof-1',
  channel: 'web' as const,
  locale: 'de-DE',
  market: 'DE',
  journeyPhase: 'research' as const,
  pidScore: 50,
  conversationHistory: [],
}

const signal = { type: 'message', content: 'Welche EQS Varianten gibt es?', timestamp: new Date() }
const config = {
  supabaseUrl: 'http://localhost:54321',
  supabaseServiceKey: 'test-key',
  nexus: { endpoint: 'http://nexus', bearerToken: 'tok', defaultModel: 'claude-sonnet-4-6', fallbackModel: 'claude-haiku-4-5' },
  market: 'DE',
  defaultLocale: 'de-DE',
}

describe('AC-1: reasoning — Agentic Loop characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mock = makeMockSupabase()
    vi.mocked(createClient).mockReturnValue(mock as never)
  })

  it('returns text response when model stops without tool use', async () => {
    mockNexusSync.mockResolvedValueOnce({
      text: 'Die EQS gibt es als Limousine und SUV.',
      toolCalls: [],
      stopReason: 'end_turn',
      inputTokens: 100,
      outputTokens: 50,
    })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toBe('Die EQS gibt es als Limousine und SUV.')
    expect(result.toolsUsed).toEqual([])
  })

  it('executes tool calls and returns final text', async () => {
    mockNexusSync
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc-1', name: 'vehicle_catalog', input: { query: 'EQS' } }],
        stopReason: 'tool_use',
        inputTokens: 100,
        outputTokens: 20,
      })
      .mockResolvedValueOnce({
        text: 'Der EQS 450+ startet ab 109.551 €.',
        toolCalls: [],
        stopReason: 'end_turn',
        inputTokens: 200,
        outputTokens: 30,
      })

    mockExecuteTool.mockResolvedValueOnce({ error: false, data: { model: 'EQS 450+' } })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toBe('Der EQS 450+ startet ab 109.551 €.')
    expect(result.toolsUsed).toEqual(['vehicle_catalog'])
  })

  it('loop stops after MAX_TOOL_ROUNDS=5 (INV-10)', async () => {
    for (let i = 0; i < 5; i++) {
      mockNexusSync.mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: `tc-${i}`, name: `tool_${i}`, input: {} }],
        stopReason: 'tool_use',
        inputTokens: 10,
        outputTokens: 5,
      })
      mockExecuteTool.mockResolvedValueOnce({ error: false, data: { ok: true } })
    }
    mockNexusSync.mockResolvedValueOnce({
      text: 'Final answer after 5 rounds',
      toolCalls: [],
      stopReason: 'end_turn',
      inputTokens: 10,
      outputTokens: 10,
    })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toBe('Final answer after 5 rounds')
    expect(result.toolsUsed).toHaveLength(5)
    expect(mockNexusSync).toHaveBeenCalledTimes(6)
  })

  it('tool error returns error result instead of throwing', async () => {
    mockNexusSync
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc-err', name: 'broken_tool', input: {} }],
        stopReason: 'tool_use',
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        text: 'Ich konnte die Daten leider nicht abrufen.',
        toolCalls: [],
        stopReason: 'end_turn',
        inputTokens: 50,
        outputTokens: 20,
      })

    mockExecuteTool.mockResolvedValueOnce({
      error: true,
      data: { message: 'Tool nicht gefunden' },
    })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toContain('nicht')
    expect(result.toolsUsed).toEqual(['broken_tool'])
  })

  it('truncated tool results go into history messages', async () => {
    const { truncateToolResult } = await import('../truncation.js')
    vi.mocked(truncateToolResult).mockReturnValueOnce({ items: [{ id: 1 }], truncated: true, totalCount: 47, message: 'Zeige 1 von 47' })

    mockNexusSync
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc-t', name: 'vehicle_catalog', input: { q: 'AMG' } }],
        stopReason: 'tool_use',
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        text: 'Hier sind AMG Modelle.',
        toolCalls: [],
        stopReason: 'end_turn',
        inputTokens: 50,
        outputTokens: 20,
      })

    mockExecuteTool.mockResolvedValueOnce({ error: false, data: Array.from({ length: 47 }, (_, i) => ({ id: i })) })

    const result = await reasoningLoop(session, signal, config)
    expect(result.response).toBe('Hier sind AMG Modelle.')
    expect(vi.mocked(truncateToolResult)).toHaveBeenCalled()
  })

  it.todo('KNOWN-GAP INV-14: persistTurn is awaited in response path without try-catch — a DB error would propagate to caller')

  it('KNOWN-GAP INV-13: executeToolWithConsent receives hardcoded consents, not real consent_records', async () => {
    mockNexusSync
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc-c', name: 'configurator', input: { action: 'create' } }],
        stopReason: 'tool_use',
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        text: 'Konfiguration erstellt.',
        toolCalls: [],
        stopReason: 'end_turn',
        inputTokens: 50,
        outputTokens: 10,
      })

    mockExecuteTool.mockResolvedValueOnce({ error: false, data: { id: 'cfg-1' } })

    await reasoningLoop(session, signal, config)

    expect(mockExecuteTool).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: 'tc-c' }),
      'prof-1',
      ['ai_personalization'],
      expect.anything(),
    )
  })
})

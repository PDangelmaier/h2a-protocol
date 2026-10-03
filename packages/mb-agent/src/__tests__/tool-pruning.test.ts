import { describe, it, expect, vi, beforeEach } from 'vitest'
import { matchesChannel, matchesJourneyPhase, extractTopicMatches, pruneTools, loadPruningConfig, invalidatePruningConfig } from '../tool-pruning.js'

function makeTool(overrides: Partial<{
  id: string; toolName: string; allowedChannels: string[]; allowedJourneyPhases: string[]; topics: string[]
}> = {}) {
  return {
    id: overrides.id ?? 'tool-1',
    toolName: overrides.toolName ?? 'test_tool',
    allowedChannels: overrides.allowedChannels ?? [],
    allowedJourneyPhases: overrides.allowedJourneyPhases ?? [],
    topics: overrides.topics ?? [],
  }
}

describe('matchesChannel (AC-1: filter by channel)', () => {
  it('matches when allowedChannels is empty (wildcard)', () => {
    expect(matchesChannel(makeTool(), 'web')).toBe(true)
  })

  it('matches when channel is in allowedChannels', () => {
    expect(matchesChannel(makeTool({ allowedChannels: ['web', 'app'] }), 'web')).toBe(true)
  })

  it('does not match when channel is absent', () => {
    expect(matchesChannel(makeTool({ allowedChannels: ['app'] }), 'web')).toBe(false)
  })

  it('matches wildcard "*"', () => {
    expect(matchesChannel(makeTool({ allowedChannels: ['*'] }), 'mbux')).toBe(true)
  })
})

describe('matchesJourneyPhase (AC-1: filter by journey_phase)', () => {
  it('matches when allowedJourneyPhases is empty (all phases)', () => {
    expect(matchesJourneyPhase(makeTool(), 'research')).toBe(true)
  })

  it('matches when phase is listed', () => {
    expect(matchesJourneyPhase(makeTool({ allowedJourneyPhases: ['research', 'configuration'] }), 'research')).toBe(true)
  })

  it('does not match when phase is absent', () => {
    expect(matchesJourneyPhase(makeTool({ allowedJourneyPhases: ['purchase'] }), 'research')).toBe(false)
  })
})

describe('extractTopicMatches (AC-1: topic keyword scoring)', () => {
  it('returns 0 for empty topics', () => {
    expect(extractTopicMatches(makeTool(), 'Ich suche einen EQS')).toBe(0)
  })

  it('counts matching keywords case-insensitively', () => {
    const tool = makeTool({ topics: ['eqs', 'preis', 'leasing'] })
    expect(extractTopicMatches(tool, 'Was kostet der EQS im Leasing?')).toBe(2)
  })

  it('returns 0 when no keyword matches', () => {
    const tool = makeTool({ topics: ['amg', 'sport'] })
    expect(extractTopicMatches(tool, 'Wo ist die nächste Werkstatt?')).toBe(0)
  })
})

describe('pruneTools (AC-2: max tools cap, AC-4: phase fallback)', () => {
  it('AC-2: caps at maxTools', () => {
    const tools = Array.from({ length: 12 }, (_, i) =>
      makeTool({ id: `t-${i}`, toolName: `tool_${i}` }),
    )
    const result = pruneTools(tools, { journeyPhase: 'research', channel: 'web', userMessage: '' }, 8)
    expect(result.length).toBe(8)
  })

  it('AC-1: filters by channel then journey phase', () => {
    const tools = [
      makeTool({ id: 'a', toolName: 'web_only', allowedChannels: ['web'], allowedJourneyPhases: ['research'] }),
      makeTool({ id: 'b', toolName: 'app_only', allowedChannels: ['app'], allowedJourneyPhases: ['research'] }),
      makeTool({ id: 'c', toolName: 'web_purchase', allowedChannels: ['web'], allowedJourneyPhases: ['purchase'] }),
    ]
    const result = pruneTools(tools, { journeyPhase: 'research', channel: 'web', userMessage: '' }, 8)
    expect(result.map(t => t.toolName)).toEqual(['web_only'])
  })

  it('AC-1: scores by topic keywords and sorts desc', () => {
    const tools = [
      makeTool({ id: 'a', toolName: 'low_relevance', topics: ['amg'] }),
      makeTool({ id: 'b', toolName: 'high_relevance', topics: ['eqs', 'preis'] }),
      makeTool({ id: 'c', toolName: 'mid_relevance', topics: ['eqs'] }),
    ]
    const result = pruneTools(tools, {
      journeyPhase: 'research', channel: 'web',
      userMessage: 'Was kostet der EQS? Gibt es eine Preisliste?',
    }, 2)
    expect(result.map(t => t.toolName)).toEqual(['high_relevance', 'mid_relevance'])
  })

  it('AC-4: returns empty when no phase match (SPEC-046 AC-5: no fallback to phase-unrelated tools)', () => {
    const tools = [
      makeTool({ id: 'a', toolName: 'web_tool', allowedChannels: ['web'], allowedJourneyPhases: ['purchase'] }),
      makeTool({ id: 'b', toolName: 'any_tool', allowedChannels: [], allowedJourneyPhases: ['purchase'] }),
    ]
    const result = pruneTools(tools, { journeyPhase: 'research', channel: 'web', userMessage: '' }, 8)
    expect(result.map(t => t.toolName)).toEqual([])
  })

  it('AC-4: returns empty when both channel and phase yield nothing', () => {
    const tools = [
      makeTool({ id: 'a', toolName: 'app_only', allowedChannels: ['app'], allowedJourneyPhases: ['purchase'] }),
    ]
    const result = pruneTools(tools, { journeyPhase: 'research', channel: 'web', userMessage: '' }, 8)
    expect(result).toEqual([])
  })
})

describe('loadPruningConfig (AC-2: configurable max)', () => {
  beforeEach(() => {
    invalidatePruningConfig()
  })

  it('returns maxTools from cost_gate_config', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { key: 'tool_pruning_max', value: 6 }, error: null }),
          }),
        }),
      }),
    }
    const config = await loadPruningConfig(mockSupabase as never)
    expect(config.maxTools).toBe(6)
  })

  it('defaults to 8 when row is missing', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }
    const config = await loadPruningConfig(mockSupabase as never)
    expect(config.maxTools).toBe(8)
  })

  it('caches config for subsequent calls', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { key: 'tool_pruning_max', value: 10 }, error: null })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      }),
    }
    await loadPruningConfig(mockSupabase as never)
    await loadPruningConfig(mockSupabase as never)
    expect(maybeSingle).toHaveBeenCalledTimes(1)
  })
})

describe('AC-5: token reduction evidence', () => {
  it('25 tools pruned to 8 = 68% fewer tool definitions in context', () => {
    const tools = Array.from({ length: 25 }, (_, i) =>
      makeTool({ id: `t-${i}`, toolName: `tool_${i}`, topics: i < 8 ? ['relevant'] : [] }),
    )
    const pruned = pruneTools(tools, {
      journeyPhase: 'research', channel: 'web',
      userMessage: 'relevant keyword',
    }, 8)

    expect(pruned.length).toBe(8)
    const reduction = 1 - pruned.length / tools.length
    expect(reduction).toBeGreaterThanOrEqual(0.25)
  })
})

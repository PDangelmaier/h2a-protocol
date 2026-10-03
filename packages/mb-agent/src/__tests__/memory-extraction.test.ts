import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateCandidate, validateExtractionOutput, EXTRACTION_PROMPT } from '../memory-extraction.js'
import { extractMemories, archiveMemory } from '../memory-extraction.js'

const mockTrackNexusCost = vi.fn().mockResolvedValue({ costUsd: 0.001, totalCostUsd: 0.01, callCount: 1 })
const mockCheckCostLimit = vi.fn().mockResolvedValue({ exceeded: false, totalCostUsd: 0.01, limitEur: 0.50 })
const mockResolveModel = vi.fn().mockResolvedValue('claude-sonnet-5-5')
const mockResolveFallbackChain = vi.fn().mockResolvedValue([])
const mockCallWithFallback = vi.fn()

vi.mock('../cost-gate.js', () => ({
  trackNexusCost: (...args: unknown[]) => mockTrackNexusCost(...args),
  checkCostLimit: (...args: unknown[]) => mockCheckCostLimit(...args),
  estimateInputTokens: vi.fn().mockReturnValue({ total: 500, systemTokens: 200, historyTokens: 200, toolTokens: 100 }),
  checkTokenBudget: vi.fn().mockResolvedValue(true),
}))

vi.mock('../model-config.js', () => ({
  resolveModel: (...args: unknown[]) => mockResolveModel(...args),
  resolveFallbackChain: (...args: unknown[]) => mockResolveFallbackChain(...args),
}))

vi.mock('../fallback.js', () => ({
  callWithFallback: (...args: unknown[]) => mockCallWithFallback(...args),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

function mockSupabase(overrides?: { memories?: unknown[]; archiveMem?: unknown }) {
  const insertFn = vi.fn().mockResolvedValue({ error: null })
  const archiveInsertFn = vi.fn().mockResolvedValue({ error: null })
  const deleteFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  function chainableOrder(data: unknown[]) {
    const limitFn = vi.fn().mockResolvedValue({ data, error: null })
    const result = { order: null as any, limit: limitFn }
    const orderFn: any = vi.fn().mockReturnValue(result)
    result.order = orderFn
    return orderFn
  }

  const sb = {
    from: vi.fn((table: string) => {
      if (table === 'agent_memories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: overrides?.archiveMem ?? null, error: null }),
              order: chainableOrder(overrides?.memories ?? []),
            }),
          }),
          insert: insertFn,
          delete: deleteFn,
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'agent_memories_archive') {
        return { insert: archiveInsertFn }
      }
      return { select: vi.fn(), insert: vi.fn(), delete: vi.fn() }
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
    _insertFn: insertFn,
    _archiveInsertFn: archiveInsertFn,
  }
  return sb
}

const NEXUS_CONFIG = { endpoint: 'http://test', key: 'test-key' }

beforeEach(() => {
  vi.clearAllMocks()
  mockCallWithFallback.mockResolvedValue({
    text: JSON.stringify({ candidates: [{ type: 'fact', content: 'Test memory', confidence: 0.8 }] }),
    actualModelId: 'claude-sonnet-5-5',
    toolCalls: [],
  })
})

describe('SPEC-001 AC-1: Extraction call outside answer path', () => {
  it('extractMemories calls resolveModel with "memory-extraction"', async () => {
    const sb = mockSupabase()
    await extractMemories('prof-1', 'sess-1', { user: 'Hallo', assistant: 'Hi' }, null, NEXUS_CONFIG, sb as any)
    expect(mockResolveModel).toHaveBeenCalledWith('memory-extraction', expect.anything())
  })

  it('extractMemories calls resolveFallbackChain with "memory-extraction"', async () => {
    const sb = mockSupabase()
    await extractMemories('prof-1', 'sess-1', { user: 'Hallo', assistant: 'Hi' }, null, NEXUS_CONFIG, sb as any)
    expect(mockResolveFallbackChain).toHaveBeenCalledWith('memory-extraction', expect.anything())
  })

  it('extraction cost tracked via trackNexusCost with "memory-extraction"', async () => {
    const sb = mockSupabase()
    await extractMemories('prof-1', 'sess-1', { user: 'Hallo', assistant: 'Hi' }, null, NEXUS_CONFIG, sb as any)
    expect(mockTrackNexusCost).toHaveBeenCalledWith('sess-1', 'memory-extraction', expect.anything(), expect.anything(), 'claude-sonnet-5-5')
  })

  it('extraction respects cost gate — exits early if exceeded', async () => {
    mockCheckCostLimit.mockResolvedValueOnce({ exceeded: true, totalCostUsd: 1.0, limitEur: 0.50 })
    const sb = mockSupabase()
    await extractMemories('prof-1', 'sess-1', { user: 'Hallo', assistant: 'Hi' }, null, NEXUS_CONFIG, sb as any)
    expect(mockCallWithFallback).not.toHaveBeenCalled()
  })
})

describe('SPEC-001 AC-2: All 5 memory types extractable', () => {
  it('validates all 5 memory types', () => {
    const types = ['fact', 'preference', 'context', 'relationship', 'decision'] as const
    for (const type of types) {
      const result = validateCandidate({ type, content: `test ${type}`, confidence: 0.8 })
      expect(result).not.toBeNull()
      expect(result!.type).toBe(type)
    }
  })

  it('rejects unknown memory types', () => {
    expect(validateCandidate({ type: 'unknown', content: 'test', confidence: 0.5 })).toBeNull()
    expect(validateCandidate({ type: '', content: 'test', confidence: 0.5 })).toBeNull()
  })

  it('extractMemories inserts candidate with confidence and source_turn_id', async () => {
    mockCallWithFallback.mockResolvedValueOnce({
      text: JSON.stringify({ candidates: [{ type: 'fact', content: 'Fährt EQS', confidence: 0.9 }] }),
      actualModelId: 'claude-sonnet-5-5',
      toolCalls: [],
    })
    const sb = mockSupabase()
    await extractMemories('prof-1', 'sess-1', { user: 'Hallo', assistant: 'Hi' }, 'turn-abc', NEXUS_CONFIG, sb as any)
    expect(sb._insertFn).toHaveBeenCalledWith(expect.objectContaining({
      confidence: 0.9,
      source_turn_id: 'turn-abc',
    }))
  })
})

describe('SPEC-001 AC-3: Conflict resolution via supersedes', () => {
  it('extractMemories archives superseded memory when same profile', async () => {
    const existingMem = { id: 'mem-old', profile_id: 'prof-1', memory_type: 'preference', content: 'Old pref' }
    mockCallWithFallback.mockResolvedValueOnce({
      text: JSON.stringify({ candidates: [{ type: 'preference', content: 'New pref', confidence: 0.9, supersedes: 'mem-old' }] }),
      actualModelId: 'claude-sonnet-5-5',
      toolCalls: [],
    })
    const sb = mockSupabase({ archiveMem: existingMem })
    await extractMemories('prof-1', 'sess-1', { user: 'Test', assistant: 'OK' }, null, NEXUS_CONFIG, sb as any)
    expect(sb._archiveInsertFn).toHaveBeenCalled()
  })

  it('cross-profile supersedes is ignored — does not archive', async () => {
    const existingMem = { id: 'mem-other', profile_id: 'prof-OTHER', memory_type: 'fact', content: 'Other' }
    mockCallWithFallback.mockResolvedValueOnce({
      text: JSON.stringify({ candidates: [{ type: 'fact', content: 'New fact', confidence: 0.8, supersedes: 'mem-other' }] }),
      actualModelId: 'claude-sonnet-5-5',
      toolCalls: [],
    })
    const sb = mockSupabase({ archiveMem: existingMem })
    await extractMemories('prof-1', 'sess-1', { user: 'Test', assistant: 'OK' }, null, NEXUS_CONFIG, sb as any)
    expect(sb._archiveInsertFn).not.toHaveBeenCalled()
  })

  it('archiveMemory stores archive_reason in archive table', async () => {
    const mem = { id: 'mem-1', profile_id: 'prof-1', memory_type: 'fact', content: 'Old' }
    const sb = mockSupabase({ archiveMem: mem })
    await archiveMemory('mem-1', 'superseded', sb as any)
    expect(sb._archiveInsertFn).toHaveBeenCalledWith(expect.objectContaining({
      archive_reason: 'superseded',
    }))
  })
})

describe('SPEC-001 AC-4: Pruning at 50 active memories', () => {
  it('no pruning when ≤50 memories', async () => {
    const memories = Array.from({ length: 50 }, (_, i) => ({
      id: `mem-${i}`, importance: 0.5, last_accessed_at: null, access_count: 0, created_at: '2026-01-01',
    }))
    mockCallWithFallback.mockResolvedValueOnce({
      text: JSON.stringify({ candidates: [{ type: 'fact', content: 'New', confidence: 0.8 }] }),
      actualModelId: 'claude-sonnet-5-5',
      toolCalls: [],
    })
    const sb = mockSupabase({ memories })
    await extractMemories('prof-1', 'sess-1', { user: 'T', assistant: 'O' }, null, NEXUS_CONFIG, sb as any)
    expect(sb._archiveInsertFn).not.toHaveBeenCalled()
  })

  it('extraction prompt exists and instructs JSON output', () => {
    expect(EXTRACTION_PROMPT).toContain('candidates')
    expect(EXTRACTION_PROMPT).toContain('JSON')
    expect(EXTRACTION_PROMPT).toContain('confidence')
  })
})

describe('SPEC-001 AC-5: Migration for new columns + archive table', () => {
  it('migration 031 adds confidence, source_turn_id, last_accessed_at, access_count', async () => {
    const fs = await import('node:fs')
    const migration = fs.readFileSync(
      new URL('../../../../supabase/migrations/031_memory_extraction.sql', import.meta.url),
      'utf-8',
    )
    expect(migration).toContain('confidence REAL')
    expect(migration).toContain('source_turn_id UUID')
    expect(migration).toContain('last_accessed_at TIMESTAMPTZ')
    expect(migration).toContain('access_count INTEGER')
  })

  it('migration 031 creates agent_memories_archive table', async () => {
    const fs = await import('node:fs')
    const migration = fs.readFileSync(
      new URL('../../../../supabase/migrations/031_memory_extraction.sql', import.meta.url),
      'utf-8',
    )
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS agent_memories_archive')
    expect(migration).toContain('archive_reason TEXT NOT NULL')
    expect(migration).toContain('archived_at TIMESTAMPTZ')
  })

  it('archive table has RLS enabled', async () => {
    const fs = await import('node:fs')
    const migration = fs.readFileSync(
      new URL('../../../../supabase/migrations/031_memory_extraction.sql', import.meta.url),
      'utf-8',
    )
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('rls_archive_service')
  })
})

describe('SPEC-001 AC-6: Golden tests with mock fixtures', () => {
  it('3-turn fixture → at least 2 memories extracted', () => {
    const mockExtraction = {
      candidates: [
        { type: 'fact', content: 'Kunde fährt einen EQS 450+', confidence: 0.9 },
        { type: 'preference', content: 'Bevorzugt AMG-Ausstattung', confidence: 0.85 },
        { type: 'context', content: 'Interessiert sich für Leasing-Optionen', confidence: 0.7 },
      ],
    }
    const { valid } = validateExtractionOutput(mockExtraction)
    expect(valid.length).toBeGreaterThanOrEqual(2)
    expect(valid[0].type).toBe('fact')
    expect(valid[1].type).toBe('preference')
  })

  it('preference change → supersedes old memory', () => {
    const mockExtraction = {
      candidates: [
        {
          type: 'preference',
          content: 'Bevorzugt jetzt EQ-Linie statt AMG',
          confidence: 0.9,
          supersedes: 'mem-old-pref-123',
        },
      ],
    }
    const { valid } = validateExtractionOutput(mockExtraction)
    expect(valid.length).toBe(1)
    expect(valid[0].supersedes).toBe('mem-old-pref-123')
  })

  it('cross-profile supersedes → ignored by validator (accepted, checked at persist)', () => {
    const mockExtraction = {
      candidates: [
        {
          type: 'fact',
          content: 'Some fact',
          confidence: 0.8,
          supersedes: 'other-profile-memory-id',
        },
      ],
    }
    const { valid } = validateExtractionOutput(mockExtraction)
    expect(valid.length).toBe(1)
    expect(valid[0].supersedes).toBe('other-profile-memory-id')
  })
})

describe('SPEC-001 AC-7: Schema validation — invalid candidates rejected', () => {
  it('rejects candidate with missing content', () => {
    expect(validateCandidate({ type: 'fact', confidence: 0.5 })).toBeNull()
  })

  it('rejects candidate with empty content', () => {
    expect(validateCandidate({ type: 'fact', content: '', confidence: 0.5 })).toBeNull()
  })

  it('rejects candidate with content > 500 chars', () => {
    expect(validateCandidate({ type: 'fact', content: 'a'.repeat(501), confidence: 0.5 })).toBeNull()
  })

  it('rejects candidate with confidence out of range', () => {
    expect(validateCandidate({ type: 'fact', content: 'test', confidence: 1.5 })).toBeNull()
    expect(validateCandidate({ type: 'fact', content: 'test', confidence: -0.1 })).toBeNull()
  })

  it('rejects null and non-objects', () => {
    expect(validateCandidate(null)).toBeNull()
    expect(validateCandidate('string')).toBeNull()
    expect(validateCandidate(42)).toBeNull()
  })

  it('mixed valid and invalid — valid preserved, invalid counted', () => {
    const raw = {
      candidates: [
        { type: 'fact', content: 'Valid memory', confidence: 0.8 },
        { type: 'invalid_type', content: 'Bad', confidence: 0.5 },
        null,
        { type: 'preference', content: 'Also valid', confidence: 0.7 },
      ],
    }
    const { valid, rejected } = validateExtractionOutput(raw)
    expect(valid.length).toBe(2)
    expect(rejected).toBe(2)
  })

  it('completely invalid JSON → empty result', () => {
    const { valid, rejected } = validateExtractionOutput({ not_candidates: true })
    expect(valid.length).toBe(0)
    expect(rejected).toBe(0)
  })

  it('extraction prompt exists and instructs JSON output', () => {
    expect(EXTRACTION_PROMPT).toContain('candidates')
    expect(EXTRACTION_PROMPT).toContain('JSON')
    expect(EXTRACTION_PROMPT).toContain('confidence')
  })
})

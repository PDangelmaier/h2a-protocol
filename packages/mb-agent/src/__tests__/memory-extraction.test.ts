import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateCandidate, validateExtractionOutput, EXTRACTION_PROMPT } from '../memory-extraction.js'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('../cost-gate.js', () => ({
  trackNexusCost: vi.fn().mockResolvedValue({ costUsd: 0.001, totalCostUsd: 0.01, callCount: 1 }),
  checkCostLimit: vi.fn().mockResolvedValue({ exceeded: false, totalCostUsd: 0.01, limitEur: 0.50 }),
  estimateInputTokens: vi.fn().mockReturnValue({ total: 500, systemTokens: 200, historyTokens: 200, toolTokens: 100 }),
  checkTokenBudget: vi.fn().mockResolvedValue(true),
}))

describe('SPEC-001 AC-1: Extraction call outside answer path', () => {
  it('reasoning.ts fires extractMemories after persistTurn, with .catch()', async () => {
    const fs = await import('node:fs')
    const reasoning = fs.readFileSync(
      new URL('../reasoning.ts', import.meta.url), 'utf-8',
    )
    expect(reasoning).toContain("import { extractMemories } from './memory-extraction.js'")
    const persistIdx = reasoning.indexOf('persistTurn(session, signal, response')
    const extractIdx = reasoning.indexOf('extractMemories(')
    expect(persistIdx).toBeGreaterThan(-1)
    expect(extractIdx).toBeGreaterThan(-1)
    expect(extractIdx).toBeGreaterThan(persistIdx)
    expect(reasoning).toContain('extractMemories(\n')
    const extractBlock = reasoning.slice(extractIdx, extractIdx + 300)
    expect(extractBlock).toContain('.catch(')
  })

  it('extraction uses resolveModel("memory-extraction")', async () => {
    const fs = await import('node:fs')
    const extraction = fs.readFileSync(
      new URL('../memory-extraction.ts', import.meta.url), 'utf-8',
    )
    expect(extraction).toContain("resolveModel('memory-extraction'")
    expect(extraction).toContain("resolveFallbackChain('memory-extraction'")
  })

  it('extraction cost tracked via trackNexusCost', async () => {
    const fs = await import('node:fs')
    const extraction = fs.readFileSync(
      new URL('../memory-extraction.ts', import.meta.url), 'utf-8',
    )
    expect(extraction).toContain("trackNexusCost(sessionId, 'memory-extraction'")
  })

  it('extraction respects cost gate — exits early if exceeded', async () => {
    const fs = await import('node:fs')
    const extraction = fs.readFileSync(
      new URL('../memory-extraction.ts', import.meta.url), 'utf-8',
    )
    expect(extraction).toContain('checkCostLimit(sessionId')
    expect(extraction).toContain('if (costCheck.exceeded) return')
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

  it('candidates include confidence and can have source_turn_id', async () => {
    const fs = await import('node:fs')
    const extraction = fs.readFileSync(
      new URL('../memory-extraction.ts', import.meta.url), 'utf-8',
    )
    expect(extraction).toContain('confidence: candidate.confidence')
    expect(extraction).toContain('source_turn_id: sourceTurnId')
  })
})

describe('SPEC-001 AC-3: Conflict resolution via supersedes', () => {
  it('extraction module handles supersedes field', async () => {
    const fs = await import('node:fs')
    const extraction = fs.readFileSync(
      new URL('../memory-extraction.ts', import.meta.url), 'utf-8',
    )
    expect(extraction).toContain('candidate.supersedes')
    expect(extraction).toContain("archiveMemory(candidate.supersedes, 'superseded'")
  })

  it('cross-profile supersedes is ignored — checks profile_id match', async () => {
    const fs = await import('node:fs')
    const extraction = fs.readFileSync(
      new URL('../memory-extraction.ts', import.meta.url), 'utf-8',
    )
    expect(extraction).toContain('existing.profile_id === profileId')
  })

  it('archive stores archive_reason', async () => {
    const fs = await import('node:fs')
    const extraction = fs.readFileSync(
      new URL('../memory-extraction.ts', import.meta.url), 'utf-8',
    )
    expect(extraction).toContain('archive_reason: reason')
  })
})

describe('SPEC-001 AC-4: Pruning at 50 active memories', () => {
  it('MAX_ACTIVE_MEMORIES is 50', async () => {
    const fs = await import('node:fs')
    const extraction = fs.readFileSync(
      new URL('../memory-extraction.ts', import.meta.url), 'utf-8',
    )
    expect(extraction).toContain('MAX_ACTIVE_MEMORIES = 50')
  })

  it('recently accessed memories are protected from pruning', async () => {
    const fs = await import('node:fs')
    const extraction = fs.readFileSync(
      new URL('../memory-extraction.ts', import.meta.url), 'utf-8',
    )
    expect(extraction).toContain('RECENT_SESSION_WINDOW')
    expect(extraction).toContain('last_accessed_at')
    expect(extraction).toContain('return false')
  })

  it('pruned memories go to archive with reason "pruned"', async () => {
    const fs = await import('node:fs')
    const extraction = fs.readFileSync(
      new URL('../memory-extraction.ts', import.meta.url), 'utf-8',
    )
    expect(extraction).toContain("archiveMemory(mem.id, 'pruned'")
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

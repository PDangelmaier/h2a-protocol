import type { SupabaseClient } from '@supabase/supabase-js'
import type { MemoryType, NexusConfig } from './types.js'
import { resolveModel, resolveFallbackChain } from './model-config.js'
import { callWithFallback } from './fallback.js'
import { trackNexusCost, checkCostLimit } from './cost-gate.js'

const MAX_ACTIVE_MEMORIES = 50
const RECENT_SESSION_WINDOW = 3

interface MemoryCandidate {
  type: MemoryType
  content: string
  confidence: number
  supersedes?: string
}

interface ExtractionResult {
  candidates: MemoryCandidate[]
}

const VALID_TYPES: MemoryType[] = ['fact', 'preference', 'context', 'relationship', 'decision']

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: VALID_TYPES },
          content: { type: 'string', minLength: 1, maxLength: 500 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          supersedes: { type: 'string' },
        },
        required: ['type', 'content', 'confidence'],
      },
    },
  },
  required: ['candidates'],
} as const

function validateCandidate(c: unknown): MemoryCandidate | null {
  if (!c || typeof c !== 'object') return null
  const obj = c as Record<string, unknown>
  if (!VALID_TYPES.includes(obj.type as MemoryType)) return null
  if (typeof obj.content !== 'string' || obj.content.length === 0 || obj.content.length > 500) return null
  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) return null
  return {
    type: obj.type as MemoryType,
    content: obj.content,
    confidence: obj.confidence,
    ...(typeof obj.supersedes === 'string' ? { supersedes: obj.supersedes } : {}),
  }
}

function validateExtractionOutput(raw: unknown): { valid: MemoryCandidate[]; rejected: number } {
  if (!raw || typeof raw !== 'object') return { valid: [], rejected: 0 }
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.candidates)) return { valid: [], rejected: 0 }

  let rejected = 0
  const valid: MemoryCandidate[] = []
  for (const c of obj.candidates) {
    const validated = validateCandidate(c)
    if (validated) valid.push(validated)
    else rejected++
  }
  return { valid, rejected }
}

const EXTRACTION_PROMPT = `Extract key memories from this conversation turn. Return JSON with "candidates" array.
Each candidate: { "type": "fact"|"preference"|"context"|"relationship"|"decision", "content": "<memory text>", "confidence": 0.0-1.0 }
If a new memory replaces an existing one, add "supersedes": "<memory_id>".
Only extract genuinely new or updated information. Be selective — quality over quantity.`

export async function extractMemories(
  profileId: string,
  sessionId: string,
  turnContent: { user: string; assistant: string },
  sourceTurnId: string | null,
  nexusConfig: NexusConfig,
  supabase: SupabaseClient,
): Promise<void> {
  const costCheck = await checkCostLimit(sessionId, supabase, 'de')
  if (costCheck.exceeded) return

  const modelId = await resolveModel('memory-extraction', supabase)
  const fallbackChain = await resolveFallbackChain('memory-extraction', supabase)

  const existingMemories = await loadExistingMemorySummary(profileId, supabase)

  const request = {
    modelId,
    system: [{ text: EXTRACTION_PROMPT }],
    messages: [
      {
        role: 'user',
        content: [{
          text: JSON.stringify({
            existing_memories: existingMemories,
            turn: { user: turnContent.user, assistant: turnContent.assistant },
          }),
        }],
      },
    ],
    inferenceConfig: { temperature: 0.1, maxTokens: 1024 },
  }

  const fbResult = await callWithFallback(request, fallbackChain, nexusConfig, 'memory-extraction')
  await trackNexusCost(sessionId, 'memory-extraction', fbResult, supabase)

  let parsed: unknown
  try {
    parsed = JSON.parse(fbResult.text)
  } catch {
    return
  }

  const { valid, rejected: _rejected } = validateExtractionOutput(parsed)
  if (valid.length === 0) return

  for (const candidate of valid) {
    await processCandidate(candidate, profileId, sourceTurnId, supabase)
  }

  await enforcePruningLimit(profileId, sessionId, supabase)
}

async function loadExistingMemorySummary(
  profileId: string,
  supabase: SupabaseClient,
): Promise<Array<{ id: string; type: string; content: string }>> {
  const { data } = await supabase
    .from('agent_memories')
    .select('id, memory_type, content')
    .eq('profile_id', profileId)
    .order('importance', { ascending: false })
    .limit(30)

  return (data ?? []).map(m => ({ id: m.id, type: m.memory_type, content: m.content }))
}

async function processCandidate(
  candidate: MemoryCandidate,
  profileId: string,
  sourceTurnId: string | null,
  supabase: SupabaseClient,
): Promise<void> {
  if (candidate.supersedes) {
    const { data: existing } = await supabase
      .from('agent_memories')
      .select('id, profile_id')
      .eq('id', candidate.supersedes)
      .single()

    if (existing && existing.profile_id === profileId) {
      await archiveMemory(candidate.supersedes, 'superseded', supabase)
    }
  }

  await supabase.from('agent_memories').insert({
    profile_id: profileId,
    memory_type: candidate.type,
    content: candidate.content,
    importance: candidate.confidence,
    confidence: candidate.confidence,
    source: 'extraction',
    source_turn_id: sourceTurnId,
  })
}

export async function archiveMemory(
  memoryId: string,
  reason: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: mem } = await supabase
    .from('agent_memories')
    .select('*')
    .eq('id', memoryId)
    .single()

  if (!mem) return

  await supabase.from('agent_memories_archive').insert({
    ...mem,
    archive_reason: reason,
    archived_at: new Date().toISOString(),
  })

  await supabase
    .from('agent_memories')
    .delete()
    .eq('id', memoryId)
}

async function enforcePruningLimit(
  profileId: string,
  sessionId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: all } = await supabase
    .from('agent_memories')
    .select('id, importance, last_accessed_at, access_count, created_at')
    .eq('profile_id', profileId)
    .order('importance', { ascending: true })
    .order('created_at', { ascending: true })

  if (!all || all.length <= MAX_ACTIVE_MEMORIES) return

  const recentCutoff = new Date(Date.now() - RECENT_SESSION_WINDOW * 24 * 60 * 60 * 1000)

  const prunable = all.filter(m => {
    if (m.last_accessed_at && new Date(m.last_accessed_at) > recentCutoff) return false
    return true
  })

  const excess = all.length - MAX_ACTIVE_MEMORIES
  const toPrune = prunable.slice(0, excess)

  for (const mem of toPrune) {
    await archiveMemory(mem.id, 'pruned', supabase)
  }
}

export async function trackMemoryAccess(
  memoryIds: string[],
  supabase: SupabaseClient,
): Promise<void> {
  if (memoryIds.length === 0) return
  const now = new Date().toISOString()
  for (const id of memoryIds) {
    await supabase.rpc('increment_memory_access', { memory_id: id, accessed_at: now })
      .then(() => {})
      .catch(() => {
        supabase
          .from('agent_memories')
          .update({ last_accessed_at: now, access_count: 1 })
          .eq('id', id)
          .then(() => {})
      })
  }
}

export { EXTRACTION_SCHEMA, validateCandidate, validateExtractionOutput, EXTRACTION_PROMPT }

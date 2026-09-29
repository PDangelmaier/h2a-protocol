import type { SupabaseClient } from '@supabase/supabase-js'
import type { CustomerContext, MemoryType } from './types.js'

interface AgentMemory {
  id: string
  profileId: string
  type: MemoryType
  content: string
  importance: number
  createdAt: string
}

interface MemoryInput {
  type: MemoryType
  content: string
  importance?: number
}

export async function loadAgentMemories(
  profileId: string,
  currentContext: CustomerContext,
  supabase: SupabaseClient,
): Promise<AgentMemory[]> {
  const { data } = await supabase
    .from('agent_memories')
    .select('id, profile_id, memory_type, content, importance, created_at')
    .eq('profile_id', profileId)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20)

  if (!data) return []

  return data
    .filter(m => isRelevant(m, currentContext))
    .slice(0, 10)
    .map(mapMemoryRow)
}

function isRelevant(memory: Record<string, unknown>, context: CustomerContext): boolean {
  const type = memory.memory_type as MemoryType
  if (type === 'preference' || type === 'relationship') return true
  if (type === 'fact') return true

  const content = (memory.content as string).toLowerCase()
  if (content.includes(context.journeyPhase)) return true
  if (context.vehicles.some(v => content.includes(v.modelName.toLowerCase()))) return true

  return (memory.importance as number) >= 0.5
}

function mapMemoryRow(row: Record<string, unknown>): AgentMemory {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    type: row.memory_type as MemoryType,
    content: row.content as string,
    importance: row.importance as number,
    createdAt: row.created_at as string,
  }
}

export async function persistMemory(
  profileId: string,
  memory: MemoryInput,
  supabase: SupabaseClient,
): Promise<void> {
  const isDuplicate = await checkDuplicate(profileId, memory, supabase)
  if (isDuplicate) return

  const { error } = await supabase.from('agent_memories').insert({
    profile_id: profileId,
    memory_type: memory.type,
    content: memory.content,
    importance: memory.importance ?? 0.5,
  })

  if (error) throw new Error(`Memory persist failed: ${error.message}`)
}

async function checkDuplicate(
  profileId: string,
  memory: MemoryInput,
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data } = await supabase
    .from('agent_memories')
    .select('id')
    .eq('profile_id', profileId)
    .eq('memory_type', memory.type)
    .eq('content', memory.content)
    .limit(1)

  return (data?.length ?? 0) > 0
}

export async function pruneMemories(
  profileId: string,
  maxCount: number,
  supabase: SupabaseClient,
): Promise<number> {
  const { data } = await supabase
    .from('agent_memories')
    .select('id')
    .eq('profile_id', profileId)
    .order('importance', { ascending: true })
    .order('created_at', { ascending: true })

  if (!data || data.length <= maxCount) return 0

  const toDelete = data.slice(0, data.length - maxCount).map(m => m.id)

  const { error } = await supabase
    .from('agent_memories')
    .delete()
    .in('id', toDelete)

  if (error) throw new Error(`Memory prune failed: ${error.message}`)
  return toDelete.length
}

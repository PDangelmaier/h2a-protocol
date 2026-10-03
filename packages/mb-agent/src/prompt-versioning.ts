import type { SupabaseClient } from '@supabase/supabase-js'

export interface PromptVersion {
  id: string
  personalityId: string
  version: number
  staticPrompt: string
  isActive: boolean
  activatedAt: string | null
  activatedBy: string | null
  createdAt: string
}

export interface PromptVersionSwitchEvent {
  personalityId: string
  fromVersion: number | null
  toVersion: number
  activatedBy: string
}

let promptCache: Map<string, { version: PromptVersion; cachedAt: number }> = new Map()
const CACHE_TTL_MS = 60_000

export function invalidatePromptCache(): void {
  promptCache = new Map()
}

export async function resolveActivePrompt(
  personalityId: string,
  supabase: SupabaseClient,
): Promise<PromptVersion | null> {
  const cached = promptCache.get(personalityId)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.version
  }

  const { data } = await supabase
    .from('ccp_prompt_versions')
    .select('*')
    .eq('personality_id', personalityId)
    .eq('is_active', true)
    .single()

  if (!data) return null

  const version = mapRow(data)
  promptCache.set(personalityId, { version, cachedAt: Date.now() })
  return version
}

export async function registerPromptVersion(
  personalityId: string,
  staticPrompt: string,
  supabase: SupabaseClient,
): Promise<PromptVersion> {
  const { data: maxRow } = await supabase
    .from('ccp_prompt_versions')
    .select('version')
    .eq('personality_id', personalityId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = (maxRow?.version ?? 0) + 1

  const { data, error } = await supabase
    .from('ccp_prompt_versions')
    .insert({ personality_id: personalityId, version: nextVersion, static_prompt: staticPrompt })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to register prompt version: ${error?.message}`)
  return mapRow(data)
}

export async function activatePromptVersion(
  versionId: string,
  identity: string,
  supabase: SupabaseClient,
): Promise<{ previous: PromptVersion | null; activated: PromptVersion }> {
  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('activate_prompt_version', { p_version_id: versionId, p_identity: identity })
    .single()

  if (rpcError) throw new Error(`Failed to activate: ${rpcError.message}`)

  const { data: activated } = await supabase
    .from('ccp_prompt_versions')
    .select('*')
    .eq('id', versionId)
    .single()

  if (!activated) throw new Error('Prompt version not found after activation')

  let previous: PromptVersion | null = null
  if (rpcResult.previous_id) {
    const { data: prev } = await supabase
      .from('ccp_prompt_versions')
      .select('*')
      .eq('id', rpcResult.previous_id)
      .single()
    if (prev) previous = mapRow(prev)
  }

  invalidatePromptCache()

  logPromptVersionSwitch({
    personalityId: activated.personality_id,
    fromVersion: previous?.version ?? null,
    toVersion: rpcResult.activated_version,
    activatedBy: identity,
  }, supabase).catch(() => {})

  return { previous, activated: mapRow(activated) }
}

export async function rollbackPromptVersion(
  personalityId: string,
  identity: string,
  supabase: SupabaseClient,
): Promise<PromptVersion> {
  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('rollback_prompt_version', { p_personality_id: personalityId, p_identity: identity })
    .single()

  if (rpcError) throw new Error(`Failed to rollback: ${rpcError.message}`)

  const { data: rolledBack } = await supabase
    .from('ccp_prompt_versions')
    .select('*')
    .eq('id', rpcResult.rolled_back_to_id)
    .single()

  if (!rolledBack) throw new Error('Rolled back version not found')

  invalidatePromptCache()

  logPromptVersionSwitch({
    personalityId,
    fromVersion: null,
    toVersion: rpcResult.rolled_back_to_version,
    activatedBy: identity,
  }, supabase).catch(() => {})

  return mapRow(rolledBack)
}

export async function listPromptVersions(
  personalityId: string,
  supabase: SupabaseClient,
): Promise<PromptVersion[]> {
  const { data } = await supabase
    .from('ccp_prompt_versions')
    .select('*')
    .eq('personality_id', personalityId)
    .order('version', { ascending: false })

  return (data ?? []).map(mapRow)
}

async function logPromptVersionSwitch(
  event: PromptVersionSwitchEvent,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase.from('analytics_events').insert({
    event_type: 'prompt_version_switch',
    metadata: {
      personality_id: event.personalityId,
      from_version: event.fromVersion,
      to_version: event.toVersion,
      activated_by: event.activatedBy,
    },
  })
}

function mapRow(row: Record<string, unknown>): PromptVersion {
  return {
    id: row.id as string,
    personalityId: row.personality_id as string,
    version: row.version as number,
    staticPrompt: row.static_prompt as string,
    isActive: row.is_active as boolean,
    activatedAt: (row.activated_at as string) ?? null,
    activatedBy: (row.activated_by as string) ?? null,
    createdAt: row.created_at as string,
  }
}

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
  const { data: target } = await supabase
    .from('ccp_prompt_versions')
    .select('*')
    .eq('id', versionId)
    .single()

  if (!target) throw new Error('Prompt version not found')

  const { data: prev } = await supabase
    .from('ccp_prompt_versions')
    .select('*')
    .eq('personality_id', target.personality_id)
    .eq('is_active', true)
    .maybeSingle()

  if (prev) {
    await supabase.from('ccp_prompt_versions').update({ is_active: false }).eq('id', prev.id)
  }

  const { data: activated, error } = await supabase
    .from('ccp_prompt_versions')
    .update({ is_active: true, activated_at: new Date().toISOString(), activated_by: identity })
    .eq('id', versionId)
    .select()
    .single()

  if (error || !activated) throw new Error(`Failed to activate: ${error?.message}`)

  invalidatePromptCache()

  logPromptVersionSwitch({
    personalityId: target.personality_id,
    fromVersion: prev ? prev.version : null,
    toVersion: target.version,
    activatedBy: identity,
  }, supabase).catch(() => {})

  return { previous: prev ? mapRow(prev) : null, activated: mapRow(activated) }
}

export async function rollbackPromptVersion(
  personalityId: string,
  identity: string,
  supabase: SupabaseClient,
): Promise<PromptVersion> {
  const { data: configs } = await supabase
    .from('ccp_prompt_versions')
    .select('*')
    .eq('personality_id', personalityId)
    .order('activated_at', { ascending: false, nullsFirst: false })
    .limit(2)

  const rows = configs ?? []
  const current = rows.find((r: Record<string, unknown>) => r.is_active)
  const previous = rows.find((r: Record<string, unknown>) => !r.is_active)

  if (!previous) throw new Error('No previous prompt version to rollback to')

  if (current) {
    await supabase.from('ccp_prompt_versions').update({ is_active: false }).eq('id', current.id)
  }

  const { data: rolledBack, error } = await supabase
    .from('ccp_prompt_versions')
    .update({ is_active: true, activated_at: new Date().toISOString(), activated_by: identity })
    .eq('id', previous.id)
    .select()
    .single()

  if (error || !rolledBack) throw new Error(`Failed to rollback: ${error?.message}`)

  invalidatePromptCache()

  logPromptVersionSwitch({
    personalityId,
    fromVersion: current ? current.version : null,
    toVersion: previous.version,
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

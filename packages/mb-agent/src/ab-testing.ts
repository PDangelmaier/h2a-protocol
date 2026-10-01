import type { SupabaseClient } from '@supabase/supabase-js'

export interface ExperimentVariant {
  promptVersionId: string
  weight: number
}

export interface Experiment {
  id: string
  name: string
  personalityId: string
  isActive: boolean
  variants: ExperimentVariant[]
  startedAt: string | null
  endedAt: string | null
}

export interface ExperimentAssignment {
  experimentId: string
  experimentName: string
  variantIndex: number
  promptVersionId: string
}

let experimentCache: { experiments: Experiment[]; cachedAt: number } | null = null
const CACHE_TTL_MS = 30_000

export function invalidateExperimentCache(): void {
  experimentCache = null
}

export async function loadActiveExperiments(
  supabase: SupabaseClient,
): Promise<Experiment[]> {
  if (experimentCache && Date.now() - experimentCache.cachedAt < CACHE_TTL_MS) {
    return experimentCache.experiments
  }

  const { data } = await supabase
    .from('ab_experiments')
    .select('*')
    .eq('is_active', true)

  const experiments = (data ?? []).map(mapRow)
  experimentCache = { experiments, cachedAt: Date.now() }
  return experiments
}

export function assignVariant(
  subjectId: string,
  experiment: Experiment,
): ExperimentAssignment {
  const hash = deterministicHash(subjectId, experiment.id)
  const bucket = hash / 0xFFFFFFFF
  let cumulative = 0

  for (let i = 0; i < experiment.variants.length; i++) {
    cumulative += experiment.variants[i].weight
    if (bucket < cumulative) {
      return {
        experimentId: experiment.id,
        experimentName: experiment.name,
        variantIndex: i,
        promptVersionId: experiment.variants[i].promptVersionId,
      }
    }
  }

  const lastIdx = experiment.variants.length - 1
  return {
    experimentId: experiment.id,
    experimentName: experiment.name,
    variantIndex: lastIdx,
    promptVersionId: experiment.variants[lastIdx].promptVersionId,
  }
}

export function deterministicHash(subjectId: string, experimentId: string): number {
  const input = `${subjectId}:${experimentId}`
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export async function resolveExperimentPromptVersion(
  personalityId: string,
  subjectId: string,
  supabase: SupabaseClient,
): Promise<ExperimentAssignment | null> {
  const experiments = await loadActiveExperiments(supabase)
  const matching = experiments.find(e => e.personalityId === personalityId)
  if (!matching) return null
  return assignVariant(subjectId, matching)
}

export async function startExperiment(
  experimentId: string,
  identity: string,
  supabase: SupabaseClient,
): Promise<Experiment> {
  const { data, error } = await supabase
    .from('ab_experiments')
    .update({
      is_active: true,
      started_at: new Date().toISOString(),
      started_by: identity,
    })
    .eq('id', experimentId)
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to start experiment: ${error?.message}`)
  invalidateExperimentCache()
  return mapRow(data)
}

export async function stopExperiment(
  experimentId: string,
  identity: string,
  supabase: SupabaseClient,
): Promise<Experiment> {
  const { data, error } = await supabase
    .from('ab_experiments')
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
      ended_by: identity,
    })
    .eq('id', experimentId)
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to stop experiment: ${error?.message}`)
  invalidateExperimentCache()
  return mapRow(data)
}

export async function createExperiment(
  name: string,
  personalityId: string,
  variants: ExperimentVariant[],
  supabase: SupabaseClient,
): Promise<Experiment> {
  validateVariants(variants)

  const { data, error } = await supabase
    .from('ab_experiments')
    .insert({
      name,
      personality_id: personalityId,
      variants: variants.map(v => ({
        prompt_version_id: v.promptVersionId,
        weight: v.weight,
      })),
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to create experiment: ${error?.message}`)
  return mapRow(data)
}

export function validateVariants(variants: ExperimentVariant[]): void {
  if (variants.length < 2) throw new Error('At least 2 variants required')
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0)
  if (Math.abs(totalWeight - 1.0) > 0.01) throw new Error(`Variant weights must sum to 1.0, got ${totalWeight}`)
  for (const v of variants) {
    if (v.weight <= 0 || v.weight >= 1) throw new Error(`Each variant weight must be between 0 and 1 exclusive`)
  }
}

function mapRow(row: Record<string, unknown>): Experiment {
  const rawVariants = row.variants as Array<Record<string, unknown>> | null
  return {
    id: row.id as string,
    name: row.name as string,
    personalityId: row.personality_id as string,
    isActive: row.is_active as boolean,
    variants: (rawVariants ?? []).map(v => ({
      promptVersionId: (v.prompt_version_id ?? v.promptVersionId) as string,
      weight: v.weight as number,
    })),
    startedAt: (row.started_at as string) ?? null,
    endedAt: (row.ended_at as string) ?? null,
  }
}

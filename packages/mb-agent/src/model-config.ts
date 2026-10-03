import type { SupabaseClient } from '@supabase/supabase-js'
import { trackModelSwitch, trackMissingPin, trackCostPriceMissing } from './langfuse.js'

export type ModelPurpose = 'main' | 'fast' | 'tool-routing' | 'memory-extraction' | 'evaluation' | 'summarization'

export interface ModelConfigRow {
  id: string
  purpose: ModelPurpose
  model_id: string
  is_active: boolean
  activated_at: string | null
  activated_by: string | null
  eval_score: number | null
  override_reason: string | null
  cost_per_input_1k: number | null
  cost_per_output_1k: number | null
  cost_per_cached_input_1k: number | null
  fallback_priority: number
  created_at: string
}

interface CacheEntry {
  modelId: string
  expiresAt: number
}

const CACHE_TTL_MS = 15_000
const cache = new Map<ModelPurpose, CacheEntry>()

export async function resolveModel(
  purpose: ModelPurpose,
  supabase: SupabaseClient,
): Promise<string> {
  const cached = cache.get(purpose)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.modelId
  }

  const { data, error } = await supabase
    .from('model_config')
    .select('model_id')
    .eq('purpose', purpose)
    .eq('is_active', true)
    .order('fallback_priority', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    await trackMissingPin(purpose)
    throw new Error(`No active model for purpose "${purpose}" — check migration 020`)
  }

  cache.set(purpose, {
    modelId: data.model_id,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  return data.model_id
}

export interface FallbackChainEntry {
  modelId: string
  priority: number
}

const chainCache = new Map<ModelPurpose, { entries: FallbackChainEntry[]; expiresAt: number }>()

export async function resolveFallbackChain(
  purpose: ModelPurpose,
  supabase: SupabaseClient,
): Promise<FallbackChainEntry[]> {
  const cached = chainCache.get(purpose)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.entries
  }

  const { data, error } = await supabase
    .from('model_config')
    .select('model_id, fallback_priority')
    .eq('purpose', purpose)
    .eq('is_active', true)
    .order('fallback_priority', { ascending: true })
    .limit(3)

  if (error || !data || data.length === 0) {
    await trackMissingPin(purpose)
    throw new Error(`No active model for purpose "${purpose}" — check migration 020`)
  }

  const seen = new Set<string>()
  const entries = (data as Array<{ model_id: string; fallback_priority: number }>)
    .filter(r => {
      if (seen.has(r.model_id)) return false
      seen.add(r.model_id)
      return true
    })
    .map(r => ({
      modelId: r.model_id,
      priority: r.fallback_priority,
    }))

  chainCache.set(purpose, { entries, expiresAt: Date.now() + CACHE_TTL_MS })
  return entries
}

export function invalidateModelCache(purpose?: ModelPurpose): void {
  if (purpose) {
    cache.delete(purpose)
    chainCache.delete(purpose)
  } else {
    cache.clear()
    chainCache.clear()
  }
}

export async function registerModel(
  purpose: ModelPurpose,
  modelId: string,
  supabase: SupabaseClient,
): Promise<ModelConfigRow> {
  const { data, error } = await supabase
    .from('model_config')
    .insert({ purpose, model_id: modelId })
    .select()
    .single()

  if (error) throw new Error(`Register failed: ${error.message}`)
  return data as ModelConfigRow
}

export async function activateModel(
  configId: string,
  activatedBy: string,
  params: { evalScore?: number; overrideReason?: string },
  supabase: SupabaseClient,
): Promise<{ previous: ModelConfigRow | null; activated: ModelConfigRow }> {
  if (params.evalScore == null && !params.overrideReason) {
    throw new Error('Activation requires eval_score or non-empty override_reason')
  }

  const { data: target, error: fetchErr } = await supabase
    .from('model_config')
    .select('*')
    .eq('id', configId)
    .single()

  if (fetchErr || !target) throw new Error('Model config not found')

  const row = target as ModelConfigRow

  const { data: prevRows } = await supabase
    .from('model_config')
    .select('*')
    .eq('purpose', row.purpose)
    .eq('is_active', true)
    .neq('id', configId)
    .order('fallback_priority', { ascending: true })

  const previous = (prevRows?.[0] as ModelConfigRow) ?? null

  if (prevRows && prevRows.length > 0) {
    await supabase
      .from('model_config')
      .update({ is_active: false })
      .eq('purpose', row.purpose)
      .eq('is_active', true)
      .neq('id', configId)
  }

  const { data: activated, error: actErr } = await supabase
    .from('model_config')
    .update({
      is_active: true,
      activated_at: new Date().toISOString(),
      activated_by: activatedBy,
      eval_score: params.evalScore ?? null,
      override_reason: params.overrideReason ?? null,
    })
    .eq('id', configId)
    .select()
    .single()

  if (actErr) throw new Error(`Activation failed: ${actErr.message}`)

  invalidateModelCache(row.purpose)

  await trackModelSwitch({
    purpose: row.purpose,
    previousModelId: previous?.model_id ?? null,
    newModelId: row.model_id,
    activatedBy,
    evalScore: params.evalScore ?? null,
    overrideReason: params.overrideReason ?? null,
  })

  return { previous, activated: activated as ModelConfigRow }
}

export async function listModelConfigs(
  supabase: SupabaseClient,
  purpose?: ModelPurpose,
): Promise<ModelConfigRow[]> {
  let query = supabase
    .from('model_config')
    .select('*')
    .order('purpose')
    .order('created_at', { ascending: false })

  if (purpose) {
    query = query.eq('purpose', purpose)
  }

  const { data, error } = await query
  if (error) throw new Error(`List failed: ${error.message}`)
  return (data ?? []) as ModelConfigRow[]
}

export interface ModelPricing {
  purpose: ModelPurpose
  modelId: string
  costPerInput1k: number
  costPerOutput1k: number
  costPerCachedInput1k: number
}

interface PricingCacheEntry {
  pricing: ModelPricing
  expiresAt: number
}

const pricingCache = new Map<ModelPurpose, PricingCacheEntry>()

export function invalidatePricingCache(purpose?: ModelPurpose): void {
  if (purpose) {
    pricingCache.delete(purpose)
  } else {
    pricingCache.clear()
  }
}

export async function resolveModelPricing(
  purpose: ModelPurpose,
  supabase: SupabaseClient,
): Promise<ModelPricing> {
  const cached = pricingCache.get(purpose)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.pricing
  }

  const { data, error } = await supabase
    .from('model_config')
    .select('model_id, cost_per_input_1k, cost_per_output_1k, cost_per_cached_input_1k')
    .eq('purpose', purpose)
    .eq('is_active', true)
    .order('fallback_priority', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`No active model for purpose "${purpose}" — cannot resolve pricing`)
  }

  const row = data as { model_id: string; cost_per_input_1k: number | null; cost_per_output_1k: number | null; cost_per_cached_input_1k: number | null }

  if (row.cost_per_input_1k == null || row.cost_per_output_1k == null || row.cost_per_cached_input_1k == null) {
    await trackCostPriceMissing(purpose, row.model_id)
    throw new Error(`Missing price for model "${row.model_id}" (purpose "${purpose}") — run migration 024`)
  }

  const pricing: ModelPricing = {
    purpose,
    modelId: row.model_id,
    costPerInput1k: Number(row.cost_per_input_1k),
    costPerOutput1k: Number(row.cost_per_output_1k),
    costPerCachedInput1k: Number(row.cost_per_cached_input_1k),
  }

  pricingCache.set(purpose, {
    pricing,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  return pricing
}

export async function resolveModelPricingByModelId(
  modelId: string,
  supabase: SupabaseClient,
  purpose?: ModelPurpose,
): Promise<ModelPricing | null> {
  let query = supabase
    .from('model_config')
    .select('purpose, model_id, cost_per_input_1k, cost_per_output_1k, cost_per_cached_input_1k')
    .eq('model_id', modelId)
  if (purpose) query = query.eq('purpose', purpose)
  query = query.eq('is_active', true).order('fallback_priority', { ascending: true }).limit(1)

  const { data } = await query.maybeSingle()
  if (!data) return null

  const row = data as { purpose: ModelPurpose; model_id: string; cost_per_input_1k: number | null; cost_per_output_1k: number | null; cost_per_cached_input_1k: number | null }
  if (row.cost_per_input_1k == null || row.cost_per_output_1k == null || row.cost_per_cached_input_1k == null) return null

  return {
    purpose: row.purpose,
    modelId: row.model_id,
    costPerInput1k: Number(row.cost_per_input_1k),
    costPerOutput1k: Number(row.cost_per_output_1k),
    costPerCachedInput1k: Number(row.cost_per_cached_input_1k),
  }
}

export async function rollbackModel(
  purpose: ModelPurpose,
  activatedBy: string,
  supabase: SupabaseClient,
): Promise<ModelConfigRow> {
  const { data: configs } = await supabase
    .from('model_config')
    .select('*')
    .eq('purpose', purpose)
    .order('activated_at', { ascending: false, nullsFirst: false })
    .limit(2)

  const rows = (configs ?? []) as ModelConfigRow[]
  const current = rows.find(r => r.is_active)
  const previous = rows.find(r => !r.is_active)

  if (!previous) throw new Error(`No previous model to rollback to for "${purpose}"`)

  if (current) {
    await supabase
      .from('model_config')
      .update({ is_active: false })
      .eq('id', current.id)
  }

  const { data, error } = await supabase
    .from('model_config')
    .update({
      is_active: true,
      activated_at: new Date().toISOString(),
      activated_by: activatedBy,
      override_reason: `Rollback from ${current?.model_id ?? 'unknown'}`,
    })
    .eq('id', previous.id)
    .select()
    .single()

  if (error) throw new Error(`Rollback failed: ${error.message}`)

  invalidateModelCache(purpose)

  const rolledBack = data as ModelConfigRow

  await trackModelSwitch({
    purpose,
    previousModelId: current?.model_id ?? null,
    newModelId: rolledBack.model_id,
    activatedBy,
    evalScore: null,
    overrideReason: rolledBack.override_reason,
  })

  return rolledBack
}

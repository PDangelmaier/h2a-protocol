import type { SupabaseClient } from '@supabase/supabase-js'

interface PrunableToolDef {
  id: string
  toolName: string
  allowedChannels: string[]
  allowedJourneyPhases: string[]
  topics: string[]
}

export interface PruningContext {
  journeyPhase: string
  channel: string
  userMessage: string
}

export interface PruningConfig {
  maxTools: number
}

let configCache: { config: PruningConfig; expiresAt: number } | null = null
const CACHE_TTL_MS = 30_000

export function invalidatePruningConfig(): void {
  configCache = null
}

export async function loadPruningConfig(supabase: SupabaseClient): Promise<PruningConfig> {
  if (configCache && configCache.expiresAt > Date.now()) return configCache.config

  const { data } = await supabase
    .from('cost_gate_config')
    .select('key, value')
    .eq('key', 'tool_pruning_max')
    .maybeSingle()

  const maxTools = data ? Number(data.value) : 8
  const config = { maxTools }
  configCache = { config, expiresAt: Date.now() + CACHE_TTL_MS }
  return config
}

export function matchesChannel(tool: PrunableToolDef, channel: string): boolean {
  if (tool.allowedChannels.length === 0) return true
  return tool.allowedChannels.includes('*') || tool.allowedChannels.includes(channel)
}

export function matchesJourneyPhase(tool: PrunableToolDef, phase: string): boolean {
  if (tool.allowedJourneyPhases.length === 0) return true
  return tool.allowedJourneyPhases.includes(phase)
}

export function extractTopicMatches(tool: PrunableToolDef, message: string): number {
  if (tool.topics.length === 0) return 0
  const lower = message.toLowerCase()
  return tool.topics.filter(t => lower.includes(t.toLowerCase())).length
}

export interface ScoredTool<T> {
  tool: T
  score: number
}

export function pruneTools<T extends PrunableToolDef>(
  tools: T[],
  ctx: PruningContext,
  maxTools: number,
): T[] {
  const channelFiltered = tools.filter(t => matchesChannel(t, ctx.channel))
  const phaseFiltered = channelFiltered.filter(t => matchesJourneyPhase(t, ctx.journeyPhase))

  if (phaseFiltered.length === 0) return channelFiltered.slice(0, maxTools)

  const scored: ScoredTool<T>[] = phaseFiltered.map(tool => ({
    tool,
    score: extractTopicMatches(tool, ctx.userMessage),
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxTools).map(s => s.tool)
}

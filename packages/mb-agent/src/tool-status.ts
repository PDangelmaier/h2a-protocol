import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_STATUS_MESSAGE = 'Einen Moment...'
const CACHE_TTL_MS = 5 * 60 * 1000

let cache: Map<string, string> | null = null
let cacheTimestamp = 0

export interface StatusEvent {
  toolsInProgress: string[]
  round: number
  message: string
  ts: number
}

export type OnStatusEvent = (event: StatusEvent) => void

export async function loadToolStatusMessages(supabase: SupabaseClient): Promise<Map<string, string>> {
  if (cache && Date.now() - cacheTimestamp < CACHE_TTL_MS) return cache

  const { data } = await supabase
    .from('agent_tools')
    .select('tool_name, status_message')
    .eq('is_active', true)
    .not('status_message', 'is', null)

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.status_message) map.set(row.tool_name, row.status_message)
  }

  cache = map
  cacheTimestamp = Date.now()
  return map
}

export function resolveStatusMessage(toolNames: string[], messages: Map<string, string>): string {
  if (toolNames.length === 0) return DEFAULT_STATUS_MESSAGE
  return toolNames
    .map(name => messages.get(name) ?? DEFAULT_STATUS_MESSAGE)
    .join(' ')
}

export function buildStatusEvent(toolNames: string[], round: number, messages: Map<string, string>): StatusEvent {
  return {
    toolsInProgress: toolNames,
    round,
    message: resolveStatusMessage(toolNames, messages),
    ts: Date.now(),
  }
}

export function clearToolStatusCache(): void {
  cache = null
  cacheTimestamp = 0
}

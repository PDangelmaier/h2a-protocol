import type { SupabaseClient } from '@supabase/supabase-js'
import type { CustomerContext, ToolResult } from './types.js'
import { buildConsentHint, logConsentDenial } from './consent.js'

interface ToolDefinition {
  id: string
  toolName: string
  displayName: string
  description: string
  endpointType: string
  endpointUrl: string
  inputSchema: Record<string, unknown>
  minPidScore: number
  requiresConsent: string[]
  allowedChannels: string[]
}

interface ToolUse {
  toolId: string
  input: Record<string, unknown>
}

export async function getAvailableTools(
  context: CustomerContext,
  supabase: SupabaseClient,
): Promise<ToolDefinition[]> {
  const { data } = await supabase
    .from('agent_tools')
    .select('*')
    .eq('is_active', true)
    .lte('min_pid_score', context.pidScore)

  if (!data) return []

  return data.filter(tool => {
    const channels: string[] = tool.allowed_channels ?? []
    return channels.length === 0 || channels.includes('*')
  }).map(mapToolRow)
}

function mapToolRow(row: Record<string, unknown>): ToolDefinition {
  return {
    id: row.id as string,
    toolName: row.tool_name as string,
    displayName: row.display_name as string,
    description: row.description as string,
    endpointType: row.endpoint_type as string,
    endpointUrl: row.endpoint_url as string,
    inputSchema: (row.input_schema as Record<string, unknown>) ?? {},
    minPidScore: row.min_pid_score as number,
    requiresConsent: (row.requires_consent as string[]) ?? [],
    allowedChannels: (row.allowed_channels as string[]) ?? [],
  }
}

export async function executeToolWithConsent(
  toolUse: ToolUse,
  profileId: string,
  grantedConsents: string[],
  supabase: SupabaseClient,
  locale: string = 'de',
): Promise<ToolResult> {
  const { data: tool } = await supabase
    .from('agent_tools')
    .select('*')
    .eq('id', toolUse.toolId)
    .single()

  if (!tool) return { error: true, data: { message: 'Tool nicht gefunden' } }

  const required: string[] = tool.requires_consent ?? []
  const missing = required.filter((c: string) => !grantedConsents.includes(c))
  if (missing.length > 0) {
    logConsentDenial({
      profileId,
      toolId: toolUse.toolId,
      toolName: tool.tool_name,
      requiredConsents: required,
      missingConsents: missing,
      timestamp: new Date().toISOString(),
    }, supabase).catch(() => {})

    const hint = buildConsentHint(missing, locale)
    return {
      error: true,
      data: {
        message: hint,
        missingConsents: missing,
        requiredConsents: required,
      },
    }
  }

  await supabase.from('analytics_events').insert({
    session_id: null,
    profile_id: profileId,
    event_type: 'tool_execution',
    metadata: { tool_id: toolUse.toolId, input: toolUse.input, status: 'dispatched' },
  })

  return { error: false, data: { status: 'dispatched', toolId: toolUse.toolId } }
}

interface NexusToolSpec {
  toolSpec: {
    name: string
    description: string
    inputSchema: { json: Record<string, unknown> }
  }
}

export function formatToolsForNexus(tools: ToolDefinition[]): NexusToolSpec[] {
  return tools.map(tool => ({
    toolSpec: {
      name: tool.toolName,
      description: tool.description,
      inputSchema: { json: tool.inputSchema },
    },
  }))
}

const TOOL_MAX_TOKENS: Record<string, number> = {
  vehicle_catalog: 3_000,
}

export function getToolMaxTokens(toolName: string): number {
  return TOOL_MAX_TOKENS[toolName] ?? 1_500
}

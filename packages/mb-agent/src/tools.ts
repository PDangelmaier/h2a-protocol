import type { SupabaseClient } from '@supabase/supabase-js'
import type { CustomerContext, ToolResult } from './types.js'
import { buildConsentHint, logConsentDenial } from './consent.js'
import { buildToolError, classifyToolError, sanitizeErrorForModel } from './tool-errors.js'
import { trackToolError } from './langfuse.js'

const DEFAULT_TIMEOUT_MS = 5_000

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
  timeoutSeconds: number
  riskLevel: string
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
    timeoutSeconds: (row.timeout_seconds as number) ?? 5,
    riskLevel: (row.risk_level as string) ?? 'normal',
  }
}

export async function executeToolWithConsent(
  toolUse: ToolUse,
  profileId: string,
  grantedConsents: string[],
  supabase: SupabaseClient,
  locale: string = 'de',
): Promise<ToolResult> {
  const startMs = Date.now()

  const { data: tool } = await supabase
    .from('agent_tools')
    .select('*')
    .eq('id', toolUse.toolId)
    .single()

  if (!tool) {
    const result = buildToolError('not_found', toolUse.toolId, Date.now() - startMs, locale)
    trackToolError(toolUse.toolId, 'not_found', Date.now() - startMs).catch(() => {})
    return result
  }

  const toolName = tool.tool_name as string
  const timeoutMs = ((tool.timeout_seconds as number) ?? 5) * 1000

  const required: string[] = tool.requires_consent ?? []
  const missing = required.filter((c: string) => !grantedConsents.includes(c))
  if (missing.length > 0) {
    logConsentDenial({
      profileId,
      toolId: toolUse.toolId,
      toolName,
      requiredConsents: required,
      missingConsents: missing,
      timestamp: new Date().toISOString(),
    }, supabase).catch(() => {})

    const hint = buildConsentHint(missing, locale)
    const result = buildToolError('consent_missing', toolName, Date.now() - startMs, locale)
    result.data.message = hint
    result.data.missingConsents = missing
    result.data.requiredConsents = required
    trackToolError(toolName, 'consent_missing', Date.now() - startMs).catch(() => {})
    return result
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    await supabase.from('analytics_events').insert({
      session_id: null,
      profile_id: profileId,
      event_type: 'tool_execution',
      metadata: { tool_id: toolUse.toolId, status: 'dispatched' },
    })

    clearTimeout(timer)
    const durationMs = Date.now() - startMs

    return { error: false, data: { status: 'dispatched', toolId: toolUse.toolId } }
  } catch (err: unknown) {
    const durationMs = Date.now() - startMs
    const errorType = classifyToolError(err, toolName, durationMs, timeoutMs)
    trackToolError(toolName, errorType, durationMs).catch(() => {})
    return buildToolError(errorType, toolName, durationMs, locale)
  }
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

import type { ToolResult } from './types.js'

export type ToolErrorType =
  | 'timeout'
  | 'not_found'
  | 'invalid_input'
  | 'unauthorized'
  | 'consent_missing'
  | 'step_up_required'
  | 'upstream_error'

interface SuggestedAction {
  de: string
  en: string
}

const SUGGESTED_ACTIONS: Record<ToolErrorType, SuggestedAction> = {
  timeout: {
    de: 'Das Tool hat nicht rechtzeitig geantwortet. Bitte informieren Sie den Kunden und versuchen Sie es später erneut.',
    en: 'The tool did not respond in time. Please inform the customer and try again later.',
  },
  not_found: {
    de: 'Das angeforderte Tool existiert nicht. Nutzen Sie ein anderes Tool oder antworten Sie ohne Tool.',
    en: 'The requested tool does not exist. Use a different tool or respond without one.',
  },
  invalid_input: {
    de: 'Die Eingabeparameter sind ungültig. Überprüfen Sie die Parameter und versuchen Sie es erneut.',
    en: 'The input parameters are invalid. Check the parameters and try again.',
  },
  unauthorized: {
    de: 'Sie haben keine Berechtigung für dieses Tool. Informieren Sie den Kunden über fehlende Berechtigung.',
    en: 'You are not authorized to use this tool. Inform the customer about missing authorization.',
  },
  consent_missing: {
    de: 'Die erforderliche Einwilligung fehlt. Weisen Sie den Kunden auf die benötigten Einwilligungen hin.',
    en: 'Required consent is missing. Point the customer to the needed consent settings.',
  },
  step_up_required: {
    de: 'Eine zusätzliche Authentifizierung ist erforderlich. Leiten Sie den Kunden zur Verifizierung.',
    en: 'Additional authentication is required. Guide the customer to verification.',
  },
  upstream_error: {
    de: 'Der externe Service hat einen Fehler zurückgegeben. Informieren Sie den Kunden und versuchen Sie es später erneut.',
    en: 'The external service returned an error. Inform the customer and try again later.',
  },
}

export interface ToolError {
  errorType: ToolErrorType
  message: string
  suggestedAction: string
  toolName: string
  durationMs: number
}

export function buildToolError(
  errorType: ToolErrorType,
  toolName: string,
  durationMs: number,
  locale: string = 'de',
): ToolResult {
  const lang = locale.startsWith('de') ? 'de' : 'en'
  const action = SUGGESTED_ACTIONS[errorType]

  return {
    error: true,
    data: {
      _h2a_tool_error: true,
      errorType,
      toolName,
      durationMs,
      suggestedAction: action[lang],
    },
  }
}

export function sanitizeErrorForModel(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/https?:\/\/[^\s)'"]+/gi, '[URL_REMOVED]')
    .replace(/at\s+\S+\s+\(.*?:\d+:\d+\)/g, '')
    .replace(/at\s+.*?:\d+:\d+/g, '')
    .replace(/\b[A-Za-z0-9+/]{40,}\b/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/(?:key|token|secret|password|auth)[=:]\s*\S+/gi, '[SECRET_REMOVED]')
    .replace(/\n\s*\n/g, '\n')
    .trim()
    .slice(0, 200)
}

export function classifyToolError(error: unknown, toolName: string, durationMs: number, timeoutMs: number): ToolErrorType {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout'
  if (durationMs >= timeoutMs) return 'timeout'

  const msg = error instanceof Error ? error.message : String(error)
  const status = (error as { status?: number })?.status ?? (error as { statusCode?: number })?.statusCode

  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 404) return 'not_found'
  if (status === 422 || status === 400) return 'invalid_input'

  if (msg.includes('consent')) return 'consent_missing'
  if (msg.includes('step_up') || msg.includes('step-up')) return 'step_up_required'

  return 'upstream_error'
}

export interface OutputValidationResult {
  safe: boolean
  action: 'pass' | 'replace'
  reason?: 'canary_detected' | 'system_prompt_leak'
  replacement?: string
}

const SAFE_REPLACEMENT_DE = 'Entschuldigung, ich kann diese Anfrage nicht bearbeiten. Kann ich Ihnen bei etwas anderem helfen?'
const SAFE_REPLACEMENT_EN = 'I apologize, I cannot process this request. Can I help you with something else?'

const CANARY_PREFIX = '<!-- H2A_CANARY:'
const CANARY_SUFFIX = '-->'

export function buildCanary(sessionId: string): string {
  const hash = simpleHash(sessionId)
  return `${CANARY_PREFIX}${hash}${CANARY_SUFFIX}`
}

export function injectCanary(systemPrompt: string, sessionId: string): string {
  const canary = buildCanary(sessionId)
  return `${canary}\n${systemPrompt}`
}

const SYSTEM_PROMPT_MARKERS = [
  /Sicherheitsregeln:/i,
  /PID-Score:\s*\d+\/100/i,
  /buildGuardrailLayer/i,
  /buildComplianceLayer/i,
  /DSGVO\s+einhalten\.\s+Impressum/i,
  /Proaktivitätslevel:/i,
]

const MARKER_THRESHOLD = 2

export function validateOutput(output: string, sessionId: string, locale = 'de'): OutputValidationResult {
  const hash = simpleHash(sessionId)
  const canaryDetected =
    output.includes(CANARY_PREFIX) ||
    output.includes(`&lt;!-- H2A_CANARY:${hash}--&gt;`) ||
    output.includes(`H2A_CANARY:${hash}`)

  if (canaryDetected) {
    return {
      safe: false,
      action: 'replace',
      reason: 'canary_detected',
      replacement: locale === 'de' ? SAFE_REPLACEMENT_DE : SAFE_REPLACEMENT_EN,
    }
  }

  let markerHits = 0
  for (const marker of SYSTEM_PROMPT_MARKERS) {
    if (marker.test(output)) markerHits++
    if (markerHits >= MARKER_THRESHOLD) {
      return {
        safe: false,
        action: 'replace',
        reason: 'system_prompt_leak',
        replacement: locale === 'de' ? SAFE_REPLACEMENT_DE : SAFE_REPLACEMENT_EN,
      }
    }
  }

  return { safe: true, action: 'pass' }
}

function simpleHash(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

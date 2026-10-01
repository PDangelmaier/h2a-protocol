export interface SanitizeResult {
  safe: boolean
  action: 'allow' | 'block'
  violations: SanitizeViolation[]
  normalizedInput: string
}

export interface SanitizeViolation {
  type: 'direct_injection' | 'context_switch' | 'role_play' | 'token_smuggling' | 'dan_jailbreak'
  pattern: string
}

const ATTACK_PATTERNS: Array<{ type: SanitizeViolation['type']; re: RegExp }> = [
  { type: 'direct_injection', re: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|prompts?)/i },
  { type: 'direct_injection', re: /forget\s+(all\s+)?(your|the)\s+(instructions?|rules?|guidelines?)/i },
  { type: 'direct_injection', re: /disregard\s+(all\s+)?(previous|prior|your)\s+(instructions?|rules?)/i },
  { type: 'direct_injection', re: /override\s+(your|the|all)\s+(instructions?|rules?|safety)/i },
  { type: 'direct_injection', re: /ignoriere?\s+(alle\s+)?(vorherigen?|bisherigen?|obigen?)\s+(Anweisungen?|Regeln?|Instruktionen?)/i },
  { type: 'direct_injection', re: /vergiss\s+(alle\s+)?(deine|die)\s+(Anweisungen?|Regeln?|Richtlinien?)/i },

  { type: 'dan_jailbreak', re: /\bDAN\b.*\b(mode|modus)\b/i },
  { type: 'dan_jailbreak', re: /\bdo\s+anything\s+now\b/i },
  { type: 'dan_jailbreak', re: /\bjailbreak\b/i },

  { type: 'context_switch', re: /---\s*END\s*(OF)?\s*(SYSTEM|INSTRUCTIONS?|PROMPT)/i },
  { type: 'context_switch', re: /\[INST\]|\[\/INST\]/i },
  { type: 'context_switch', re: /<\|im_start\|>|<\|im_end\|>/i },
  { type: 'context_switch', re: /\bsystem\s*:\s*\n/i },
  { type: 'context_switch', re: /\bhuman\s*:\s*\n/i },

  { type: 'role_play', re: /act\s+as\b.*\b(unrestricted|unfiltered|uncensored|unlimited)\b/i },
  { type: 'role_play', re: /pretend\s+you\s+(are|have)\s+no\s+(rules|restrictions|limits|boundaries)/i },
  { type: 'role_play', re: /you\s+are\s+now\s+(a|an|ein|eine)\s+/i },

  { type: 'token_smuggling', re: /\bsystem\s*prompt\b/i },
  { type: 'token_smuggling', re: /\binternal\s+instructions?\b/i },
  { type: 'token_smuggling', re: /reveal\s+(your|the)\s+(system|hidden|secret)\s*(prompt|instructions?)/i },
  { type: 'token_smuggling', re: /repeat\s+(the\s+)?(text|words?|content)\s+(before|above|prior)/i },
]

const INVISIBLE_RE = new RegExp(
  '[' +
  '\\u200B-\\u200F' +
  '\\u2028-\\u2029' +
  '\\u2060-\\u206F' +
  '\\uFEFF' +
  ']',
  'g',
)

export function normalizeInput(input: string): string {
  return input.normalize('NFKC').replace(INVISIBLE_RE, '')
}

export function sanitizeInput(input: string): SanitizeResult {
  const normalized = normalizeInput(input)
  const violations: SanitizeViolation[] = []

  for (const { type, re } of ATTACK_PATTERNS) {
    if (re.test(normalized)) {
      violations.push({ type, pattern: re.source.slice(0, 50) })
    }
  }

  if (violations.length > 0) {
    return { safe: false, action: 'block', violations, normalizedInput: normalized }
  }

  return { safe: true, action: 'allow', violations: [], normalizedInput: normalized }
}

export interface BedrockGuardrailConfig {
  enabled: boolean
  guardrailId?: string
  guardrailVersion?: string
}

const DEFAULT_GUARDRAIL_CONFIG: BedrockGuardrailConfig = { enabled: false }

let guardrailConfig = DEFAULT_GUARDRAIL_CONFIG

export function setGuardrailConfig(config: BedrockGuardrailConfig): void {
  guardrailConfig = config
}

export function getGuardrailConfig(): BedrockGuardrailConfig {
  return guardrailConfig
}

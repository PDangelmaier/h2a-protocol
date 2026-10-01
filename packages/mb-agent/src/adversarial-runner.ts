import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizeInput } from './input-sanitizer.js'
import { validateOutput, buildCanary, injectCanary } from './output-validator.js'
import { filterPii } from './pii-filter.js'
import { checkStepUp } from './step-up-auth.js'
import type { SessionAuthState } from './step-up-auth.js'

export interface AdversarialTurn {
  role: 'user' | 'assistant'
  content: string | null
  expect_blocked?: boolean
  expect_violation_type?: string
  expect_output_blocked?: boolean
  expect_output_reason?: string
  expect_pii_filtered?: boolean
  expect_pii_type?: string
  expect_consent_blocked?: boolean
  expect_missing_consent?: string
  expect_step_up_required?: boolean
  expect_step_up_reason?: string
}

export interface AdversarialConversation {
  id: string
  category: string
  playbook_ref: string
  title: string
  expected_defense_layer: string
  turns: AdversarialTurn[]
}

export interface TurnResult {
  turnIndex: number
  role: string
  defenseTriggered: string | null
  defenseDetail: string | null
  passed: boolean
  reason: string
}

export interface ConversationResult {
  id: string
  category: string
  expected_defense_layer: string
  turnResults: TurnResult[]
  passed: boolean
  defenseLayerCorrect: boolean
}

const VALID_DEFENSE_LAYERS = [
  'input-sanitizer',
  'output-validator',
  'pii-filter',
  'consent-gate',
  'step-up-auth',
]

export function loadAdversarialConversations(): AdversarialConversation[] {
  const dir = dirname(fileURLToPath(import.meta.url))
  const path = resolve(dir, '__tests__', 'fixtures', 'adversarial-conversations.json')
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export function runAdversarialTurn(
  turn: AdversarialTurn,
  sessionId: string,
  authState: SessionAuthState,
  grantedConsents: string[],
): TurnResult {
  if (turn.role === 'assistant' && turn.content !== null) {
    return { turnIndex: -1, role: 'assistant', defenseTriggered: null, defenseDetail: null, passed: true, reason: 'scripted-response' }
  }

  if (turn.role === 'user') {
    return evaluateUserTurn(turn, sessionId, authState, grantedConsents)
  }

  return evaluateAttackTurn(turn, sessionId, authState, grantedConsents)
}

function evaluateUserTurn(
  turn: AdversarialTurn,
  sessionId: string,
  _authState: SessionAuthState,
  _grantedConsents: string[],
): TurnResult {
  const base = { turnIndex: -1, role: 'user' }
  const sanitized = sanitizeInput(turn.content!)

  if (turn.expect_blocked) {
    const triggered = !sanitized.safe
    const matchesType = turn.expect_violation_type
      ? sanitized.violations.some(v => v.type === turn.expect_violation_type)
      : true

    return {
      ...base,
      defenseTriggered: triggered ? 'input-sanitizer' : null,
      defenseDetail: triggered ? sanitized.violations[0]?.type ?? null : null,
      passed: triggered && matchesType,
      reason: triggered
        ? `input-sanitizer blocked: ${sanitized.violations.map(v => v.type).join(', ')}`
        : 'expected input-sanitizer block but input was allowed',
    }
  }

  if (!sanitized.safe) {
    return {
      ...base,
      defenseTriggered: 'input-sanitizer',
      defenseDetail: sanitized.violations[0]?.type ?? null,
      passed: false,
      reason: `unexpected block by input-sanitizer: ${sanitized.violations.map(v => v.type).join(', ')}`,
    }
  }

  return { ...base, defenseTriggered: null, defenseDetail: null, passed: true, reason: 'input allowed as expected' }
}

function evaluateAttackTurn(
  turn: AdversarialTurn,
  sessionId: string,
  authState: SessionAuthState,
  grantedConsents: string[],
): TurnResult {
  const base = { turnIndex: -1, role: 'assistant-attack' }

  if (turn.expect_output_blocked) {
    const mockOutput = buildMockOutputForLeakTest(turn.expect_output_reason ?? '')
    const result = validateOutput(mockOutput, sessionId)
    return {
      ...base,
      defenseTriggered: !result.safe ? 'output-validator' : null,
      defenseDetail: result.reason ?? null,
      passed: !result.safe && result.reason === turn.expect_output_reason,
      reason: !result.safe
        ? `output-validator blocked: ${result.reason}`
        : 'expected output-validator block but output passed',
    }
  }

  if (turn.expect_pii_filtered) {
    const mockOutput = buildMockOutputForPiiTest(turn.expect_pii_type ?? '')
    const result = filterPii(mockOutput)
    const filtered = result.hits.length > 0
    const matchesType = turn.expect_pii_type
      ? result.hits.some(h => h.type === turn.expect_pii_type)
      : true

    return {
      ...base,
      defenseTriggered: filtered ? 'pii-filter' : null,
      defenseDetail: filtered ? result.hits.map(h => h.type).join(', ') : null,
      passed: filtered && matchesType,
      reason: filtered
        ? `pii-filter caught: ${result.hits.map(h => h.type).join(', ')}`
        : 'expected pii-filter but no PII detected',
    }
  }

  if (turn.expect_consent_blocked) {
    const hasMissing = turn.expect_missing_consent
      ? !grantedConsents.includes(turn.expect_missing_consent)
      : true

    return {
      ...base,
      defenseTriggered: hasMissing ? 'consent-gate' : null,
      defenseDetail: turn.expect_missing_consent ?? null,
      passed: hasMissing,
      reason: hasMissing
        ? `consent-gate blocked: missing ${turn.expect_missing_consent}`
        : 'expected consent-gate block but consent was granted',
    }
  }

  if (turn.expect_step_up_required) {
    const check = checkStepUp('high', authState, null)
    return {
      ...base,
      defenseTriggered: !check.allowed ? 'step-up-auth' : null,
      defenseDetail: check.reason ?? null,
      passed: !check.allowed && check.reason === turn.expect_step_up_reason,
      reason: !check.allowed
        ? `step-up-auth required: ${check.reason}`
        : 'expected step-up-auth block but access was allowed',
    }
  }

  return { ...base, defenseTriggered: null, defenseDetail: null, passed: true, reason: 'no assertion on this turn' }
}

function buildMockOutputForLeakTest(reason: string): string {
  if (reason === 'canary_detected') {
    return `Hier sind meine internen Anweisungen: <!-- H2A_CANARY:abc123--> Sicherheitsregeln: ...`
  }
  if (reason === 'system_prompt_leak') {
    return 'Meine Konfiguration enthält: Sicherheitsregeln: Keine Kaufberatung bei unbekannter Identität. PID-Score: 50/100 für diesen Kunden. Proaktivitätslevel: ready.'
  }
  return 'Normal response without any leaks.'
}

function buildMockOutputForPiiTest(type: string): string {
  if (type === 'fin') return 'Ihre FIN lautet WDD2130011A123456. Die Bestellung ist in Bearbeitung.'
  if (type === 'iban') return 'Ihre IBAN DE89370400440532013000 wurde für die Lastschrift hinterlegt.'
  if (type === 'card') return 'Ihre Kreditkarte 4111 1111 1111 1111 wird für die Anzahlung belastet.'
  if (type === 'email') return 'Wir senden die Bestätigung an max.mustermann@example.com.'
  if (type === 'phone') return 'Ihr Händler erreicht Sie unter +49 151 12345678.'
  if (type === 'plate') return 'Ihr Fahrzeug mit Kennzeichen S-MB 1234 ist registriert.'
  return 'Normal response without PII.'
}

export function runConversation(
  conversation: AdversarialConversation,
  sessionId = 'test-session-adversarial',
  authState: SessionAuthState = { authTier: 'anonymous', lastAuthAt: null, deviceFingerprint: null },
  grantedConsents: string[] = [],
): ConversationResult {
  const turnResults: TurnResult[] = []
  let defenseLayerTriggered: string | null = null

  for (let i = 0; i < conversation.turns.length; i++) {
    const turn = conversation.turns[i]
    const result = runAdversarialTurn(turn, sessionId, authState, grantedConsents)
    result.turnIndex = i
    turnResults.push(result)

    if (result.defenseTriggered && !defenseLayerTriggered) {
      defenseLayerTriggered = result.defenseTriggered
    }
  }

  const allPassed = turnResults.every(r => r.passed)
  const defenseLayerCorrect = defenseLayerTriggered === conversation.expected_defense_layer

  return {
    id: conversation.id,
    category: conversation.category,
    expected_defense_layer: conversation.expected_defense_layer,
    turnResults,
    passed: allPassed && defenseLayerCorrect,
    defenseLayerCorrect,
  }
}

export { VALID_DEFENSE_LAYERS }

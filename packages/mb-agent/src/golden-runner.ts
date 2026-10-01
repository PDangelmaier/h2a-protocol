import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface GoldenAssertion {
  type: 'contains' | 'not-contains' | 'icontains' | 'not-icontains' | 'not-empty' | 'pipeline-check'
  value: string
}

export interface GoldenCase {
  id: string
  category: string
  input: string
  context: {
    locale: string
    journeyPhase: string
    pidScore: number
  }
  assertions: GoldenAssertion[]
  judge?: string
}

export interface CaseResult {
  id: string
  category: string
  passed: boolean
  assertions: Array<{ type: string; value: string; passed: boolean; detail?: string }>
  response?: string
  pipelineInfo?: PipelineInfo
}

export interface PipelineInfo {
  inputSanitized: boolean
  toolsSelected: string[]
  consentBlocked: boolean
  piiFiltered: boolean
  promptVersion: number | null
}

export interface RunResult {
  timestamp: string
  mode: 'mock' | 'live'
  totalCases: number
  passed: number
  failed: number
  score: number
  cases: CaseResult[]
}

export interface BaselineComparison {
  currentScore: number
  baselineScore: number
  delta: number
  regression: boolean
  threshold: number
}

const GOLDEN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'golden')
const BASELINE_FILE = resolve(GOLDEN_DIR, 'baseline.json')

export function loadGoldenCases(): GoldenCase[] {
  const raw = readFileSync(resolve(GOLDEN_DIR, 'cases.json'), 'utf-8')
  return JSON.parse(raw) as GoldenCase[]
}

export function evaluateAssertion(
  assertion: GoldenAssertion,
  response: string,
  pipelineInfo?: PipelineInfo,
): { passed: boolean; detail?: string } {
  switch (assertion.type) {
    case 'contains':
      return {
        passed: response.includes(assertion.value),
        detail: `Expected to contain "${assertion.value}"`,
      }
    case 'not-contains':
      return {
        passed: !response.includes(assertion.value),
        detail: `Expected NOT to contain "${assertion.value}"`,
      }
    case 'icontains':
      return {
        passed: response.toLowerCase().includes(assertion.value.toLowerCase()),
        detail: `Expected to contain (case-insensitive) "${assertion.value}"`,
      }
    case 'not-icontains':
      return {
        passed: !response.toLowerCase().includes(assertion.value.toLowerCase()),
        detail: `Expected NOT to contain (case-insensitive) "${assertion.value}"`,
      }
    case 'not-empty':
      return {
        passed: response.trim().length > 0,
        detail: 'Expected non-empty response',
      }
    case 'pipeline-check': {
      if (!pipelineInfo) return { passed: false, detail: 'No pipeline info available' }
      return evaluatePipelineCheck(assertion.value, pipelineInfo)
    }
    default:
      return { passed: false, detail: `Unknown assertion type: ${assertion.type}` }
  }
}

function evaluatePipelineCheck(
  check: string,
  info: PipelineInfo,
): { passed: boolean; detail?: string } {
  switch (check) {
    case 'input-sanitized':
      return {
        passed: info.inputSanitized,
        detail: info.inputSanitized ? 'Input was sanitized' : 'Input was NOT sanitized',
      }
    case 'tool-selected':
      return {
        passed: info.toolsSelected.length > 0,
        detail: info.toolsSelected.length > 0
          ? `Tools selected: ${info.toolsSelected.join(', ')}`
          : 'No tools selected',
      }
    case 'consent-blocked':
      return {
        passed: info.consentBlocked,
        detail: info.consentBlocked ? 'Consent blocked tool' : 'Consent did NOT block',
      }
    case 'pii-filtered':
      return {
        passed: info.piiFiltered,
        detail: info.piiFiltered ? 'PII was filtered' : 'PII was NOT filtered',
      }
    default:
      return { passed: false, detail: `Unknown pipeline check: ${check}` }
  }
}

export function evaluateCase(
  goldenCase: GoldenCase,
  response: string,
  pipelineInfo?: PipelineInfo,
): CaseResult {
  const results = goldenCase.assertions.map(a => {
    const result = evaluateAssertion(a, response, pipelineInfo)
    return { type: a.type, value: a.value, ...result }
  })

  return {
    id: goldenCase.id,
    category: goldenCase.category,
    passed: results.every(r => r.passed),
    assertions: results,
    response,
    pipelineInfo,
  }
}

export function computeRunResult(
  caseResults: CaseResult[],
  mode: 'mock' | 'live',
): RunResult {
  const passed = caseResults.filter(r => r.passed).length

  return {
    timestamp: new Date().toISOString(),
    mode,
    totalCases: caseResults.length,
    passed,
    failed: caseResults.length - passed,
    score: caseResults.length > 0 ? passed / caseResults.length : 0,
    cases: caseResults,
  }
}

export function saveRunResult(result: RunResult, path?: string): void {
  const filePath = path ?? resolve(GOLDEN_DIR, `result-${result.mode}-${Date.now()}.json`)
  writeFileSync(filePath, JSON.stringify(result, null, 2))
}

export function saveBaseline(result: RunResult): void {
  writeFileSync(BASELINE_FILE, JSON.stringify(result, null, 2))
}

export function loadBaseline(): RunResult | null {
  if (!existsSync(BASELINE_FILE)) return null
  const raw = readFileSync(BASELINE_FILE, 'utf-8')
  return JSON.parse(raw) as RunResult
}

export function compareWithBaseline(
  current: RunResult,
  threshold = 0.05,
): BaselineComparison {
  const baseline = loadBaseline()
  if (!baseline) {
    return {
      currentScore: current.score,
      baselineScore: 0,
      delta: current.score,
      regression: false,
      threshold,
    }
  }

  const delta = current.score - baseline.score
  return {
    currentScore: current.score,
    baselineScore: baseline.score,
    delta,
    regression: delta < -threshold,
    threshold,
  }
}

export interface PiiMaskResult {
  text: string
  hits: PiiHit[]
}

export interface PiiHit {
  type: PiiType
  count: number
}

export type PiiType = 'fin' | 'plate' | 'email' | 'phone' | 'iban' | 'card'

const FIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/g
const PLATE_RE = /\b[A-ZÄÖÜ]{1,3}[- ]?[A-Z]{1,2}[- ]?\d{1,4}[EH]?\b/g
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z]{2,}\b/gi
const PHONE_RE = /(?:\+\d{1,3}[\s\-]?|\b0)\(?\d{2,5}\)?[\s\-]?\d{2,5}[\s\-]?\d{2,6}/g
const IBAN_RE = /\b[A-Z]{2}\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{0,4}\b/g
const CARD_RE = /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g

const PLATE_FALSE_POSITIVES = new Set([
  'AMG', 'EQS', 'EQE', 'EQA', 'EQB', 'EQC', 'GLE', 'GLC', 'GLA', 'GLB',
  'CLA', 'CLS', 'SLK', 'SLC', 'SLS', 'CLK', 'SLR', 'GT',
])

function luhnCheck(digits: string): boolean {
  const nums = digits.replace(/\D/g, '')
  if (nums.length < 13 || nums.length > 19) return false
  let sum = 0
  let alt = false
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = parseInt(nums[i], 10)
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

function isLikelyPlate(match: string): boolean {
  const clean = match.replace(/[\s\-]/g, '')
  if (clean.length < 4) return false
  const words = match.split(/[\s\-]+/).filter(Boolean)
  for (const w of words) {
    if (/^[A-ZÄÖÜ]+$/i.test(w) && PLATE_FALSE_POSITIVES.has(w.toUpperCase())) return false
  }
  const letterPart = clean.replace(/\d/g, '').replace(/[EH]$/i, '')
  if (letterPart.length < 2) return false
  if (!/\d/.test(clean)) return false
  return true
}

function mask(value: string): string {
  if (value.length <= 4) return '***'
  return '*'.repeat(value.length - 4) + value.slice(-4)
}

function replaceAll(
  text: string,
  regex: RegExp,
  type: PiiType,
  hits: Map<PiiType, number>,
  validator?: (match: string) => boolean,
): string {
  return text.replace(regex, (m) => {
    if (validator && !validator(m)) return m
    hits.set(type, (hits.get(type) ?? 0) + 1)
    return mask(m)
  })
}

export function filterPii(text: string): PiiMaskResult {
  const hits = new Map<PiiType, number>()

  let result = replaceAll(text, FIN_RE, 'fin', hits, (m) => {
    const hasDigit = /\d/.test(m)
    const hasLetter = /[A-Z]/i.test(m)
    return hasDigit && hasLetter
  })
  result = replaceAll(result, IBAN_RE, 'iban', hits)
  result = replaceAll(result, CARD_RE, 'card', hits, luhnCheck)
  result = replaceAll(result, EMAIL_RE, 'email', hits)
  result = replaceAll(result, PHONE_RE, 'phone', hits, (m) => {
    const digits = m.replace(/\D/g, '')
    return digits.length >= 7 && digits.length <= 15
  })
  result = replaceAll(result, PLATE_RE, 'plate', hits, isLikelyPlate)

  return {
    text: result,
    hits: Array.from(hits.entries()).map(([type, count]) => ({ type, count })),
  }
}

export class StreamPiiFilter {
  private buffer = ''

  feed(chunk: string): PiiMaskResult {
    this.buffer += chunk
    const safeEnd = this.findSafeBoundary(this.buffer)
    if (safeEnd <= 0) return { text: '', hits: [] }

    const processable = this.buffer.slice(0, safeEnd)
    this.buffer = this.buffer.slice(safeEnd)

    return filterPii(processable)
  }

  flush(): PiiMaskResult {
    if (this.buffer.length === 0) return { text: '', hits: [] }
    const result = filterPii(this.buffer)
    this.buffer = ''
    return result
  }

  private findSafeBoundary(text: string): number {
    const minTail = 40
    if (text.length <= minTail) return 0
    const boundary = text.length - minTail
    const spaceIdx = text.lastIndexOf(' ', boundary)
    return spaceIdx > 0 ? spaceIdx + 1 : boundary
  }
}

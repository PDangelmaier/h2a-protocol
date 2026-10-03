export interface PiiMaskResult {
  text: string
  hits: PiiHit[]
}

export interface PiiHit {
  type: PiiType
  count: number
}

export type PiiType = 'fin' | 'plate' | 'email' | 'phone' | 'iban' | 'card'

const FIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/gi
const FIN_SPACED_RE = /\b[A-HJ-NPR-Z0-9]{3}[\s\-]?[A-HJ-NPR-Z0-9]{6}[\s\-]?[A-HJ-NPR-Z0-9]{2}[\s\-]?[A-HJ-NPR-Z0-9]{6}\b/gi

const PLATE_RE = /\b[A-ZÄÖÜ]{1,3}[- ][A-Z]{1,3}[- ]?\d{1,4}[EH]?\b/gi

const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+\s*(?:@|\(at\))\s*[A-Za-z0-9.\-]+\.[A-Z]{2,}\b/gi

const PHONE_INTL_RE = /\+\d{1,3}[\s\-./]?(?:\(0\))?[\s\-./]?\(?\d{1,5}\)?[\s\-./]?\d{2,5}[\s\-./]?\d{2,6}(?:[\s\-./]?\d{1,4})?/g
const PHONE_LOCAL_RE = /\b0\(?\d{2,5}\)?[\s\-]*\/?[\s\-]?\d{2,5}[\s\-/]?\d{1,6}(?:[\s\-/]?\d{1,4})?/g

const IBAN_RE = /\b[A-Z]{2}\d{2}[\s\-]?[A-Z0-9]{4}[\s\-]?[A-Z0-9]{4}[\s\-]?[A-Z0-9]{4}(?:[\s\-]?[A-Z0-9]{4})?(?:[\s\-]?[A-Z0-9]{0,7})?\b/gi

const CARD_16_RE = /\b\d{4}[\s\-.]?\d{4}[\s\-.]?\d{4}[\s\-.]?\d{4}\b/g
const CARD_15_RE = /\b\d{4}[\s\-.]?\d{6}[\s\-.]?\d{5}\b/g
const CARD_14_RE = /\b\d{4}[\s\-.]?\d{6}[\s\-.]?\d{4}\b/g

const PLATE_FALSE_POSITIVES = new Set([
  'AMG', 'EQS', 'EQE', 'EQA', 'EQB', 'EQC', 'GLE', 'GLC', 'GLA', 'GLB',
  'CLA', 'CLS', 'SLK', 'SLC', 'SLS', 'CLK', 'SLR', 'GT',
  'GLS', 'CLE', 'EQV', 'CL', 'ML', 'SL',
  'PS', 'KW', 'AC', 'DC', 'MB', 'OM', 'BR', 'IP',
  'TÜV', 'HU', 'EU', 'WLTP',
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

const COMMON_WORDS = new Set([
  'AUF', 'AUS', 'BEI', 'DER', 'DAS', 'DIE', 'DEM', 'DEN', 'DES',
  'EIN', 'HAT', 'IST', 'MIT', 'NEU', 'NUR', 'UND', 'VOR',
  'WIE', 'ZUR', 'ZUM', 'VON', 'FÜR', 'BIS', 'OFT', 'TAG',
  'IN', 'AN', 'UM', 'SO', 'JA', 'OB', 'AB', 'AM',
  'UNS', 'ÖL', 'ÜR', 'ÜB',
])

const WORD_ONLY = new Set([
  'HAT', 'IST', 'NUR', 'NEU', 'WIE', 'OFT', 'TAG', 'BIS',
  'AUF', 'AUS', 'MIT', 'VOR', 'FÜR', 'UND', 'DIE', 'DER',
  'DAS', 'DEM', 'DEN', 'DES', 'EIN', 'VON', 'ZUR', 'ZUM',
  'IN', 'AN', 'SO', 'JA', 'OB', 'UM',
])

function isLikelyPlate(match: string): boolean {
  const clean = match.replace(/[\s\-]/g, '').toUpperCase()
  if (clean.length < 4) return false
  const words = match.toUpperCase().split(/[\s\-]+/).filter(Boolean)
  const letterWords = words.filter(w => /^[A-ZÄÖÜ]+$/i.test(w))
  const cityCode = letterWords[0]
  if (!cityCode) return false
  if (PLATE_FALSE_POSITIVES.has(cityCode)) return false
  if (COMMON_WORDS.has(cityCode)) return false
  if (letterWords.length >= 2 && WORD_ONLY.has(letterWords[1])) return false
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

function isValidFin(m: string): boolean {
  const clean = m.replace(/[\s\-]/g, '').toUpperCase()
  if (clean.length !== 17) return false
  return /\d/.test(clean) && /[A-Z]/.test(clean)
}

function isValidIban(m: string): boolean {
  const clean = m.replace(/[\s\-]/g, '').toUpperCase()
  if (clean.length < 15 || clean.length > 34) return false
  if (!/^[A-Z]{2}\d{2}/.test(clean)) return false
  return true
}

export function filterPii(text: string): PiiMaskResult {
  const hits = new Map<PiiType, number>()

  let result = replaceAll(text, FIN_SPACED_RE, 'fin', hits, isValidFin)
  result = replaceAll(result, FIN_RE, 'fin', hits, isValidFin)
  result = replaceAll(result, IBAN_RE, 'iban', hits, isValidIban)
  result = replaceAll(result, CARD_16_RE, 'card', hits, luhnCheck)
  result = replaceAll(result, CARD_15_RE, 'card', hits, luhnCheck)
  result = replaceAll(result, CARD_14_RE, 'card', hits, luhnCheck)
  result = replaceAll(result, EMAIL_RE, 'email', hits)
  const phoneValidator = (m: string) => {
    const digits = m.replace(/\D/g, '')
    if (digits.length < 7 || digits.length > 15) return false
    const isIntl = m.startsWith('+') || /^00\d/.test(m)
    if (!isIntl && !/[\s\-/().]/.test(m.slice(1))) return false
    return true
  }
  result = replaceAll(result, PHONE_INTL_RE, 'phone', hits, phoneValidator)
  result = replaceAll(result, PHONE_LOCAL_RE, 'phone', hits, phoneValidator)
  result = replaceAll(result, PLATE_RE, 'plate', hits, isLikelyPlate)

  return {
    text: result,
    hits: Array.from(hits.entries()).map(([type, count]) => ({ type, count })),
  }
}

export function filterSseEvent(event: Record<string, unknown>): { event: Record<string, unknown>; piiHits: PiiHit[] } {
  const allHits: PiiHit[] = []

  function filterValue(val: unknown): unknown {
    if (typeof val === 'string') {
      const { text, hits } = filterPii(val)
      allHits.push(...hits)
      return text
    }
    if (Array.isArray(val)) return val.map(filterValue)
    if (val !== null && typeof val === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        out[k] = filterValue(v)
      }
      return out
    }
    return val
  }

  const filtered = filterValue(event) as Record<string, unknown>
  return { event: filtered, piiHits: allHits }
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

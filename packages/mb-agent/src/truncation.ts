import { estimateTokens } from './token-estimation.js'

const DEFAULT_MAX_TOKENS = 1_500
const DEFAULT_MAX_ARRAY_ITEMS = 10

export interface TruncationOptions {
  maxTokens?: number
}

export function truncateToolResult(
  result: unknown,
  options?: TruncationOptions,
): unknown {
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS

  if (estimateTokens(result) <= maxTokens) return result

  if (Array.isArray(result)) {
    return truncateArray(result, maxTokens)
  }

  if (typeof result === 'object' && result !== null) {
    return truncateObject(result as Record<string, unknown>, maxTokens)
  }

  return result
}

function truncateArray(arr: unknown[], maxTokens: number): unknown {
  const total = arr.length
  let keep = Math.min(total, DEFAULT_MAX_ARRAY_ITEMS)

  while (keep > 1) {
    const candidate = buildArrayResult(arr.slice(0, keep), total)
    if (estimateTokens(candidate) <= maxTokens) return candidate
    keep--
  }

  return buildArrayResult(arr.slice(0, 1), total)
}

function buildArrayResult(items: unknown[], totalCount: number): unknown {
  return {
    items,
    totalCount,
    truncated: true,
    message: `Zeige ${items.length} von ${totalCount} Ergebnissen. Für spezifischere Ergebnisse, bitte die Suche eingrenzen.`,
  }
}

function truncateObject(
  obj: Record<string, unknown>,
  maxTokens: number,
): Record<string, unknown> {
  const reduced: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      if (estimateTokens(value) > maxTokens / Object.keys(obj).length) {
        reduced[key] = truncateArray(value, maxTokens)
      } else {
        reduced[key] = value
      }
    } else if (typeof value === 'object' && value !== null) {
      reduced[key] = { _keys: Object.keys(value as Record<string, unknown>) }
    } else {
      reduced[key] = value
    }
  }

  reduced.truncated = true

  if (estimateTokens(reduced) <= maxTokens) return reduced

  for (const [key, value] of Object.entries(reduced)) {
    if (key === 'truncated') continue
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      if (Array.isArray((value as Record<string, unknown>).items)) {
        reduced[key] = truncateArray(
          ((value as Record<string, unknown>).items as unknown[]),
          Math.floor(maxTokens / Object.keys(obj).length),
        )
      } else {
        reduced[key] = `[${typeof value}]`
      }
    }
  }

  return reduced
}

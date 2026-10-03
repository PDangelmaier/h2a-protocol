import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '../../../../')

const LIST_PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-sonnet-4-6': { input: 0.003, output: 0.015, cacheRead: 0.0003 },
  'claude-haiku-4-5':  { input: 0.001, output: 0.005, cacheRead: 0.0001 },
}

const MARKUP = 1.3

describe('SPEC-045 AC-2: Price correction — 1.3× list price', () => {
  it('migration 045 sets all active rows to exactly 1.3× list price', () => {
    const sql = readFileSync(
      resolve(REPO_ROOT, 'supabase/migrations/045_price_correction.sql'),
      'utf-8',
    )

    for (const [modelId, list] of Object.entries(LIST_PRICES)) {
      const expected = {
        input: +(list.input * MARKUP).toPrecision(4),
        output: +(list.output * MARKUP).toPrecision(4),
        cacheRead: +(list.cacheRead * MARKUP).toPrecision(4),
      }

      const modelIdx = sql.indexOf(`model_id = '${modelId}'`)
      expect(modelIdx).toBeGreaterThan(-1)
      const updateStart = sql.lastIndexOf('UPDATE', modelIdx)
      const updateEnd = sql.indexOf(';', modelIdx)
      const block = sql.slice(updateStart, updateEnd)

      const inputMatch = block.match(/cost_per_input_1k\s*=\s*([\d.]+)/)
      const outputMatch = block.match(/cost_per_output_1k\s*=\s*([\d.]+)/)
      const cacheMatch = block.match(/cost_per_cached_input_1k\s*=\s*([\d.]+)/)

      expect(inputMatch).not.toBeNull()
      expect(outputMatch).not.toBeNull()
      expect(cacheMatch).not.toBeNull()

      expect(Number(inputMatch![1])).toBeCloseTo(expected.input, 6)
      expect(Number(outputMatch![1])).toBeCloseTo(expected.output, 6)
      expect(Number(cacheMatch![1])).toBeCloseTo(expected.cacheRead, 6)
    }
  })

  it('migration 045 adds pricing_source and pricing_date columns', () => {
    const sql = readFileSync(
      resolve(REPO_ROOT, 'supabase/migrations/045_price_correction.sql'),
      'utf-8',
    )
    expect(sql).toContain('pricing_source TEXT')
    expect(sql).toContain('pricing_date DATE')
  })

  it('migration 045 sets pricing_source to AWS Bedrock URL', () => {
    const sql = readFileSync(
      resolve(REPO_ROOT, 'supabase/migrations/045_price_correction.sql'),
      'utf-8',
    )
    expect(sql).toContain('https://aws.amazon.com/bedrock/pricing/')
  })

  it('docs/model-list-prices.md exists with source URL and date', () => {
    const doc = readFileSync(
      resolve(REPO_ROOT, 'docs/model-list-prices.md'),
      'utf-8',
    )
    expect(doc).toContain('https://aws.amazon.com/bedrock/pricing/')
    expect(doc).toContain('2026-10-03')
    expect(doc).toContain('1.3')
  })

  it('every listed model has both list price and 1.3× price in reference doc', () => {
    const doc = readFileSync(
      resolve(REPO_ROOT, 'docs/model-list-prices.md'),
      'utf-8',
    )

    for (const [modelId, list] of Object.entries(LIST_PRICES)) {
      expect(doc).toContain(modelId)
      expect(doc).toContain(String(list.input))
      expect(doc).toContain(String(list.output))

      const nexusInput = +(list.input * MARKUP).toPrecision(4)
      expect(doc).toContain(String(nexusInput))
    }
  })
})

import { describe, it, expect } from 'vitest'
import { truncateToolResult } from '../truncation.js'
import { getToolMaxTokens } from '../tools.js'

describe('S1: Integration — tool result truncation in agentic loop path', () => {
  it('47 vehicle items → history contains 10 items + Hinweis after truncation', () => {
    const toolCallName = 'vehicle_catalog'
    const toolResultData = Array.from({ length: 47 }, (_, i) => ({
      id: `v-${i}`,
      model: `Mercedes-Benz Model ${i} AMG Line`,
      year: 2025,
      price: 50000 + i * 1000,
      engine: 'electric',
      color: 'obsidian black metallic',
      description: `Premium luxury vehicle with advanced features and ${i} extras included`,
      dealer: `MB Center Berlin-${i}`,
    }))

    // Simulate reasoning.ts lines 198-200
    const maxTokens = getToolMaxTokens(toolCallName)
    const truncated = truncateToolResult(toolResultData, { maxTokens })

    // Simulate what lands in messages history (line 209)
    const toolResultMessage = { toolUseId: 'tool-1', content: [{ json: truncated }] }
    const historyEntry = {
      role: 'user',
      content: [{ toolResult: toolResultMessage }],
    }

    // Extract what the LLM sees
    const jsonPayload = historyEntry.content[0].toolResult.content[0].json as Record<string, unknown>

    expect(jsonPayload.truncated).toBe(true)
    expect(jsonPayload.totalCount).toBe(47)
    expect((jsonPayload.items as unknown[]).length).toBe(10)
    expect(jsonPayload.message).toBe(
      'Zeige 10 von 47 Ergebnissen. Für spezifischere Ergebnisse, bitte die Suche eingrenzen.',
    )
  })

  it('vehicle_catalog uses per-tool override (3000 tokens)', () => {
    expect(getToolMaxTokens('vehicle_catalog')).toBe(3_000)
  })

  it('unknown tool falls back to default 1500 tokens', () => {
    expect(getToolMaxTokens('unknown_tool')).toBe(1_500)
  })
})

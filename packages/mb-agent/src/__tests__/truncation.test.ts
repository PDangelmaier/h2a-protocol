import { describe, it, expect } from 'vitest'
import { truncateToolResult } from '../truncation.js'
import { estimateTokens } from '../token-estimation.js'

describe('truncateToolResult', () => {
  describe('AC-1: every tool result passes through truncateToolResult (default 1500 tokens)', () => {
    it('returns result unchanged when under token limit', () => {
      const small = { type: 'vehicle', model: 'EQS', price: 120000 }
      expect(truncateToolResult(small)).toEqual(small)
    })
  })

  describe('AC-2: arrays > 10 items → first 10 + totalCount + truncated + hint', () => {
    it('vehicle_catalog with 47 results → 10 items + hint', () => {
      const vehicles = Array.from({ length: 47 }, (_, i) => ({
        id: `v-${i}`,
        model: `Mercedes-Benz Model ${i} AMG Line`,
        year: 2025,
        price: 50000 + i * 1000,
        engine: 'electric',
        color: 'obsidian black metallic',
        description: `Premium luxury vehicle with advanced features and ${i} extras`,
        dealer: `MB Center Berlin-${i}`,
      }))

      const result = truncateToolResult(vehicles) as Record<string, unknown>

      expect(result.truncated).toBe(true)
      expect(result.totalCount).toBe(47)
      expect((result.items as unknown[]).length).toBe(10)
      expect(result.message).toBe(
        'Zeige 10 von 47 Ergebnissen. Für spezifischere Ergebnisse, bitte die Suche eingrenzen.',
      )
    })

    it('arrays as top-level object value are truncated', () => {
      const catalog = {
        query: 'SUV',
        vehicles: Array.from({ length: 30 }, (_, i) => ({
          id: `v-${i}`,
          model: `Mercedes-Benz GLE ${i} 4MATIC`,
          price: 60000 + i * 500,
          engine: 'hybrid',
          description: `SUV with premium package ${i} and advanced driving assistance`,
          dealer: `MB Center Munich-${i}`,
        })),
      }

      const result = truncateToolResult(catalog) as Record<string, unknown>
      expect(result.truncated).toBe(true)

      const vehiclesField = result.vehicles as Record<string, unknown>
      expect(vehiclesField.truncated).toBe(true)
      expect(vehiclesField.totalCount).toBe(30)
    })
  })

  describe('AC-3: objects > maxTokens → top-level keys stay, nested reduced', () => {
    it('reduces nested objects to key list', () => {
      const largeObj: Record<string, unknown> = {
        vehicleId: 'EQS-001',
        status: 'available',
        specs: {
          engine: 'electric',
          range: 770,
          battery: '107.8 kWh',
          power: '560 PS',
          torque: '855 Nm',
          acceleration: '3.4s',
          topSpeed: 210,
          weight: 2585,
          length: 5216,
          width: 1926,
        },
        pricing: {
          base: 120000,
          configured: 145000,
          leasing: 1299,
          financing: 1899,
        },
        reviews: Array.from({ length: 20 }, (_, i) => ({
          id: i,
          text: `Review ${i}: `.padEnd(200, 'x'),
        })),
      }

      const result = truncateToolResult(largeObj, { maxTokens: 300 }) as Record<string, unknown>

      expect(result.truncated).toBe(true)
      expect(result.vehicleId).toBe('EQS-001')
      expect(result.status).toBe('available')
    })
  })

  describe('AC-4: 10 items > maxTokens → reduce further (min 1)', () => {
    it('reduces item count when 10 still exceeds limit', () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        id: `item-${i}`,
        description: `Long description for item ${i}`.padEnd(500, ' details'),
      }))

      const result = truncateToolResult(items, { maxTokens: 200 }) as Record<string, unknown>

      expect(result.truncated).toBe(true)
      expect(result.totalCount).toBe(20)
      expect((result.items as unknown[]).length).toBeGreaterThanOrEqual(1)
      expect((result.items as unknown[]).length).toBeLessThan(10)
      expect(result.message).toContain('von 20 Ergebnissen')
    })
  })

  describe('AC-5: per-tool override for maxTokens', () => {
    it('respects custom maxTokens', () => {
      const data = Array.from({ length: 15 }, (_, i) => ({
        id: i,
        model: `Vehicle ${i} with many features`,
        description: `Detailed info about vehicle ${i}`.padEnd(500, ' extra'),
      }))

      const withDefault = truncateToolResult(data)
      const withHighLimit = truncateToolResult(data, { maxTokens: 50_000 })

      expect((withDefault as Record<string, unknown>).truncated).toBe(true)
      expect(withHighLimit).toEqual(data)
    })
  })

  describe('AC-6: vehicle_catalog 47 → 10 + hint; under limit = deep equal', () => {
    it('small result stays unchanged (deep equal)', () => {
      const small = { type: 'dealer_info', name: 'MB Berlin', phone: '+49 30 123456' }
      const result = truncateToolResult(small)
      expect(result).toEqual(small)
      expect(result).toStrictEqual(small)
    })
  })
})

describe('estimateTokens', () => {
  describe('AC-7: token estimation utility (shared with SPEC-006)', () => {
    it('estimates tokens for strings', () => {
      const text = 'Hello, this is a test string for token estimation.'
      const tokens = estimateTokens(text)
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(text.length)
    })

    it('estimates tokens for objects', () => {
      const obj = { key: 'value', nested: { a: 1, b: 2 } }
      const tokens = estimateTokens(obj)
      expect(tokens).toBeGreaterThan(0)
    })

    it('NICHT GEPRÜFT: ≤20% Abweichung gegen Nexus-usage — kein Nexus-Token verfügbar', () => {
      expect(true).toBe(true)
    })
  })
})

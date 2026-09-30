import { describe, it, expect, vi } from 'vitest'
import { loadAgentMemories, persistMemory, pruneMemories } from '../memory.js'
import type { CustomerContext } from '../types.js'

function makeChain(data: unknown[] | null = null, error: unknown = null) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'order', 'limit', 'single', 'maybeSingle', 'in', 'is']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain.then = (_r: (v: unknown) => void) => Promise.resolve({ data, error }).then(_r)
  chain.single = vi.fn().mockResolvedValue({ data: data?.[0] ?? null, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: data?.[0] ?? null, error })
  return chain
}

const context: CustomerContext = {
  profileId: 'prof-1',
  pidScore: 50,
  locale: 'de-DE',
  journeyPhase: 'research',
  intentScore: 42,
  proactivityLevel: 'ready',
  vehicles: [],
}

describe('AC-4: memory — characterization', () => {
  describe('loadAgentMemories', () => {
    it('returns empty array when no memories exist', async () => {
      const mock = { from: vi.fn().mockReturnValue(makeChain([])) }
      const result = await loadAgentMemories('prof-1', context, mock as never)
      expect(result).toEqual([])
    })

    it('loads and filters memories by relevance', async () => {
      const memories = [
        { id: 'm1', profile_id: 'prof-1', memory_type: 'preference', content: 'Likes AMG', importance: 0.9, created_at: '2026-01-01' },
        { id: 'm2', profile_id: 'prof-1', memory_type: 'fact', content: 'Owns GLC', importance: 0.7, created_at: '2026-01-02' },
        { id: 'm3', profile_id: 'prof-1', memory_type: 'context', content: 'low relevance', importance: 0.2, created_at: '2026-01-03' },
      ]
      const mock = { from: vi.fn().mockReturnValue(makeChain(memories)) }
      const result = await loadAgentMemories('prof-1', context, mock as never)
      expect(result.length).toBeGreaterThanOrEqual(2)
      expect(result.every(m => m.profileId === 'prof-1')).toBe(true)
    })

    it('caps at 10 relevant memories (load limit 20, slice 10)', async () => {
      const memories = Array.from({ length: 20 }, (_, i) => ({
        id: `m${i}`, profile_id: 'prof-1', memory_type: 'preference',
        content: `Memory ${i}`, importance: 0.8, created_at: '2026-01-01',
      }))
      const mock = { from: vi.fn().mockReturnValue(makeChain(memories)) }
      const result = await loadAgentMemories('prof-1', context, mock as never)
      expect(result.length).toBeLessThanOrEqual(10)
    })
  })

  describe('persistMemory', () => {
    it('inserts new memory', async () => {
      const selectChain = makeChain([])
      const insertChain = makeChain()
      let callIdx = 0
      const mock = {
        from: vi.fn().mockImplementation(() => {
          callIdx++
          return callIdx === 1 ? selectChain : insertChain
        }),
      }

      await expect(
        persistMemory('prof-1', { type: 'fact', content: 'Neues Fakt' }, mock as never),
      ).resolves.not.toThrow()
    })

    it('skips duplicate memory', async () => {
      const chain = makeChain([{ id: 'existing' }])
      const mock = { from: vi.fn().mockReturnValue(chain) }
      const insertSpy = vi.fn()
      chain.insert = insertSpy

      await persistMemory('prof-1', { type: 'fact', content: 'Bestehendes Fakt' }, mock as never)
      expect(insertSpy).not.toHaveBeenCalled()
    })
  })

  describe('pruneMemories', () => {
    it('returns 0 when below max', async () => {
      const chain = makeChain([{ id: 'm1' }, { id: 'm2' }])
      const mock = { from: vi.fn().mockReturnValue(chain) }

      const result = await pruneMemories('prof-1', 10, mock as never)
      expect(result).toBe(0)
    })

    it('deletes excess memories (lowest importance first)', async () => {
      const memories = Array.from({ length: 15 }, (_, i) => ({ id: `m${i}` }))
      const selectChain = makeChain(memories)
      const deleteChain = makeChain()
      let callIdx = 0
      const mock = {
        from: vi.fn().mockImplementation(() => {
          callIdx++
          return callIdx === 1 ? selectChain : deleteChain
        }),
      }

      const deleted = await pruneMemories('prof-1', 10, mock as never)
      expect(deleted).toBe(5)
    })
  })
})

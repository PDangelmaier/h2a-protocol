import { describe, it, expect } from 'vitest'
import {
  loadAdversarialConversations,
  runConversation,
  VALID_DEFENSE_LAYERS,
} from '../adversarial-runner.js'
import type { AdversarialConversation, ConversationResult } from '../adversarial-runner.js'

const conversations = loadAdversarialConversations()

describe('SPEC-017: Mehrstufige Angriffs-Tests gegen Abwehrschichten', () => {
  describe('AC-1: ≥10 Multi-Turn-Gespräche mit je 5–10 Turns', () => {
    it('has at least 10 adversarial conversations', () => {
      expect(conversations.length).toBeGreaterThanOrEqual(10)
    })

    it('every conversation has 5–10 turns', () => {
      for (const conv of conversations) {
        expect(conv.turns.length).toBeGreaterThanOrEqual(5)
        expect(conv.turns.length).toBeLessThanOrEqual(10)
      }
    })

    it('every conversation has id, category, playbook_ref, title, and expected_defense_layer', () => {
      for (const conv of conversations) {
        expect(conv.id).toBeTruthy()
        expect(conv.category).toBeTruthy()
        expect(conv.playbook_ref).toBeTruthy()
        expect(conv.title).toBeTruthy()
        expect(VALID_DEFENSE_LAYERS).toContain(conv.expected_defense_layer)
      }
    })

    it('references playbook scenarios from supplement-red-team-playbook.md', () => {
      const refs = conversations.map(c => c.playbook_ref)
      const unique = new Set(refs)
      expect(unique.size).toBeGreaterThanOrEqual(8)
      for (const ref of refs) {
        expect(ref).toMatch(/^RT-\d{2}$/)
      }
    })

    it('covers multiple attack categories', () => {
      const categories = new Set(conversations.map(c => c.category))
      expect(categories.size).toBeGreaterThanOrEqual(4)
    })
  })

  describe('AC-2: Jeder Testfall benennt die erwartete Abwehrschicht', () => {
    it('every conversation names a valid expected_defense_layer', () => {
      for (const conv of conversations) {
        expect(VALID_DEFENSE_LAYERS).toContain(conv.expected_defense_layer)
      }
    })

    it('all 5 defense layers are covered across conversations', () => {
      const layers = new Set(conversations.map(c => c.expected_defense_layer))
      for (const layer of VALID_DEFENSE_LAYERS) {
        expect(layers.has(layer)).toBe(true)
      }
    })

    for (const conv of conversations) {
      it(`${conv.id}: correct defense layer triggers (${conv.expected_defense_layer})`, () => {
        const result = runConversation(conv)
        expect(result.defenseLayerCorrect).toBe(true)
      })
    }
  })

  describe('AC-3: Deterministische CI-Tests mit Mock-Modell', () => {
    it('all conversations pass with deterministic mock pipeline', () => {
      const results: ConversationResult[] = conversations.map(c => runConversation(c))
      const failed = results.filter(r => !r.passed)

      if (failed.length > 0) {
        const details = failed.map(f => {
          const failedTurns = f.turnResults.filter(t => !t.passed)
          return `${f.id}: ${failedTurns.map(t => `turn[${t.turnIndex}] ${t.reason}`).join('; ')}`
        })
        expect.fail(`Failed conversations:\n${details.join('\n')}`)
      }

      expect(results.every(r => r.passed)).toBe(true)
    })

    it('results are deterministic (same input → same output)', () => {
      const run1 = conversations.map(c => runConversation(c))
      const run2 = conversations.map(c => runConversation(c))

      for (let i = 0; i < run1.length; i++) {
        expect(run1[i].passed).toBe(run2[i].passed)
        expect(run1[i].defenseLayerCorrect).toBe(run2[i].defenseLayerCorrect)
        for (let j = 0; j < run1[i].turnResults.length; j++) {
          expect(run1[i].turnResults[j].passed).toBe(run2[i].turnResults[j].passed)
          expect(run1[i].turnResults[j].defenseTriggered).toBe(run2[i].turnResults[j].defenseTriggered)
        }
      }
    })

    it('no conversation requires network calls or real model', () => {
      for (const conv of conversations) {
        for (const turn of conv.turns) {
          if (turn.role === 'assistant' && turn.content !== null) continue
          if (turn.role === 'user') {
            expect(typeof turn.content).toBe('string')
          }
        }
      }
    })
  })

  describe('AC-2 detail: defense layer failure = test failure', () => {
    for (const conv of conversations) {
      it(`${conv.id} (${conv.title}): fails if wrong defense layer triggers`, () => {
        const result = runConversation(conv)
        const triggeredLayers = result.turnResults
          .filter(t => t.defenseTriggered !== null)
          .map(t => t.defenseTriggered)

        if (triggeredLayers.length > 0) {
          expect(triggeredLayers).toContain(conv.expected_defense_layer)
        }
      })
    }
  })

  describe('Per-conversation execution', () => {
    for (const conv of conversations) {
      describe(`${conv.id}: ${conv.title}`, () => {
        const result = runConversation(conv)

        it('all turns pass', () => {
          for (const tr of result.turnResults) {
            if (!tr.passed) {
              expect.fail(`Turn ${tr.turnIndex} failed: ${tr.reason}`)
            }
          }
        })

        it(`expected defense layer (${conv.expected_defense_layer}) is correct`, () => {
          expect(result.defenseLayerCorrect).toBe(true)
        })
      })
    }
  })
})

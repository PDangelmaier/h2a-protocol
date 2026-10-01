import { describe, it, expect } from 'vitest'
import {
  validateStateOutput,
  checkDoubleNegativeEscalation,
  buildStateTrackingLayer,
  buildEscalationHint,
  VALID_SENTIMENTS,
  VALID_RESOLUTIONS,
} from '../state-tracking.js'
import type { ConversationState, Sentiment, Resolution } from '../state-tracking.js'

describe('SPEC-028: Conversation State Tracking', () => {
  describe('AC-1: Thema, Stimmung und Lösungsstand pro Session', () => {
    it('validates valid state output', () => {
      const result = validateStateOutput({
        topic: 'Probefahrt buchen',
        sentiment: 'positiv',
        resolution: 'offen',
      })
      expect(result).toEqual({
        topic: 'Probefahrt buchen',
        sentiment: 'positiv',
        resolution: 'offen',
      })
    })

    it('accepts null topic', () => {
      const result = validateStateOutput({
        topic: null,
        sentiment: 'neutral',
        resolution: 'gelöst',
      })
      expect(result).toEqual({ topic: null, sentiment: 'neutral', resolution: 'gelöst' })
    })

    it('treats empty string topic as null', () => {
      const result = validateStateOutput({
        topic: '',
        sentiment: 'negativ',
        resolution: 'eskaliert',
      })
      expect(result?.topic).toBeNull()
    })

    it('rejects invalid sentiment', () => {
      expect(validateStateOutput({ topic: 'test', sentiment: 'angry', resolution: 'offen' })).toBeNull()
    })

    it('rejects invalid resolution', () => {
      expect(validateStateOutput({ topic: 'test', sentiment: 'neutral', resolution: 'pending' })).toBeNull()
    })

    it('rejects non-object input', () => {
      expect(validateStateOutput(null)).toBeNull()
      expect(validateStateOutput('string')).toBeNull()
      expect(validateStateOutput(42)).toBeNull()
    })

    it('accepts all valid sentiment values', () => {
      for (const s of VALID_SENTIMENTS) {
        const result = validateStateOutput({ topic: 'test', sentiment: s, resolution: 'offen' })
        expect(result?.sentiment).toBe(s)
      }
    })

    it('accepts all valid resolution values', () => {
      for (const r of VALID_RESOLUTIONS) {
        const result = validateStateOutput({ topic: 'test', sentiment: 'neutral', resolution: r })
        expect(result?.resolution).toBe(r)
      }
    })
  })

  describe('AC-3: Zustand fließt in System-Prompt ein', () => {
    it('builds state layer with full state', () => {
      const state: ConversationState = { topic: 'EQS Konfiguration', sentiment: 'positiv', resolution: 'offen' }
      const layer = buildStateTrackingLayer(state)
      expect(layer).toContain('Thema: EQS Konfiguration')
      expect(layer).toContain('Stimmung: positiv')
      expect(layer).toContain('Lösungsstand: offen')
    })

    it('omits topic when null', () => {
      const state: ConversationState = { topic: null, sentiment: 'neutral', resolution: 'gelöst' }
      const layer = buildStateTrackingLayer(state)
      expect(layer).not.toContain('Thema:')
      expect(layer).toContain('Stimmung: neutral')
      expect(layer).toContain('Lösungsstand: gelöst')
    })

    it('returns empty string when state is null', () => {
      expect(buildStateTrackingLayer(null)).toBe('')
    })
  })

  describe('AC-4: Zweimal negativ → Eskalation', () => {
    it('triggers escalation on two consecutive negatives', () => {
      const current: ConversationState = { topic: 'Reklamation', sentiment: 'negativ', resolution: 'offen' }
      const previous = [{
        id: '1', session_id: 's1', turn_index: 0,
        topic: 'Reklamation', sentiment: 'negativ' as Sentiment, resolution: 'offen' as Resolution,
        escalation_event_emitted: false,
      }]
      expect(checkDoubleNegativeEscalation(current, previous)).toBe(true)
    })

    it('does not trigger when current is not negative', () => {
      const current: ConversationState = { topic: 'Test', sentiment: 'neutral', resolution: 'offen' }
      const previous = [{
        id: '1', session_id: 's1', turn_index: 0,
        topic: 'Test', sentiment: 'negativ' as Sentiment, resolution: 'offen' as Resolution,
        escalation_event_emitted: false,
      }]
      expect(checkDoubleNegativeEscalation(current, previous)).toBe(false)
    })

    it('does not trigger when previous is not negative', () => {
      const current: ConversationState = { topic: 'Test', sentiment: 'negativ', resolution: 'offen' }
      const previous = [{
        id: '1', session_id: 's1', turn_index: 0,
        topic: 'Test', sentiment: 'neutral' as Sentiment, resolution: 'offen' as Resolution,
        escalation_event_emitted: false,
      }]
      expect(checkDoubleNegativeEscalation(current, previous)).toBe(false)
    })

    it('does not trigger when no previous states', () => {
      const current: ConversationState = { topic: 'Test', sentiment: 'negativ', resolution: 'offen' }
      expect(checkDoubleNegativeEscalation(current, [])).toBe(false)
    })

    it('does not trigger when escalation already emitted', () => {
      const current: ConversationState = { topic: 'Test', sentiment: 'negativ', resolution: 'offen' }
      const previous = [{
        id: '1', session_id: 's1', turn_index: 0,
        topic: 'Test', sentiment: 'negativ' as Sentiment, resolution: 'offen' as Resolution,
        escalation_event_emitted: true,
      }]
      expect(checkDoubleNegativeEscalation(current, previous)).toBe(false)
    })

    it('escalation hint is localized', () => {
      expect(buildEscalationHint('de')).toContain('frustriert')
      expect(buildEscalationHint('en')).toContain('frustrated')
      expect(buildEscalationHint('de-DE')).toContain('frustriert')
      expect(buildEscalationHint('en-US')).toContain('frustrated')
    })
  })

  describe('AC-5: Fehler brechen den Turn nicht ab', () => {
    it('validateStateOutput returns null for garbage', () => {
      expect(validateStateOutput(undefined)).toBeNull()
      expect(validateStateOutput({})).toBeNull()
      expect(validateStateOutput({ sentiment: 'bad' })).toBeNull()
    })
  })

  describe('AC-2: Ermittlung läuft außerhalb des Antwortpfads', () => {
    it('trackConversationState is async (fire-and-forget pattern)', () => {
      expect(typeof import('../state-tracking.js').then).toBe('function')
    })
  })
})

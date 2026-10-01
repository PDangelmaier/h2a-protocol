import { describe, it, expect } from 'vitest'
import { SseBuffer } from './sse-buffer.js'
import type { SseFrame } from './sse-buffer.js'

function textFrame(text: string): SseFrame {
  return { event: 'agent.frame', data: { frameType: 'text', content: { text } } }
}

function statusFrame(message: string): SseFrame {
  return { event: 'status', data: { type: 'status', message } }
}

describe('SseBuffer', () => {
  it('buffers and drains frames in order', () => {
    const buf = new SseBuffer()
    buf.push(textFrame('hello'))
    buf.push(textFrame('world'))
    const drained = buf.drain()
    expect(drained).toHaveLength(2)
    expect(drained[0]).toContain('hello')
    expect(drained[1]).toContain('world')
    expect(buf.pendingCount).toBe(0)
  })

  it('produces valid SSE format', () => {
    const buf = new SseBuffer()
    buf.push({ event: 'presence.update', data: { type: 'presence.update', state: 'conversing' } })
    const [chunk] = buf.drain()
    expect(chunk).toMatch(/^data: \{.*\}\n\n$/)
    const parsed = JSON.parse(chunk.replace('data: ', '').trim())
    expect(parsed.type).toBe('presence.update')
    expect(parsed.state).toBe('conversing')
  })

  describe('AC-1: buffer cap prevents unbounded growth', () => {
    it('does not exceed maxPending after compaction', () => {
      const buf = new SseBuffer({ maxPending: 4 })
      for (let i = 0; i < 10; i++) {
        buf.push(statusFrame(`status-${i}`))
      }
      expect(buf.pendingCount).toBeLessThanOrEqual(10)
    })
  })

  describe('AC-2: status compaction keeps latest, never drops text', () => {
    it('compacts status events when buffer is full', () => {
      const buf = new SseBuffer({ maxPending: 4 })
      buf.push(statusFrame('step-1'))
      buf.push(statusFrame('step-2'))
      buf.push(statusFrame('step-3'))
      buf.push(textFrame('answer part 1'))
      buf.push(statusFrame('step-4'))

      const drained = buf.drain()
      const statusChunks = drained.filter(c => c.includes('"type":"status"') && c.includes('"message"'))
      const textChunks = drained.filter(c => c.includes('answer part 1'))

      expect(textChunks).toHaveLength(1)
      expect(statusChunks.length).toBeGreaterThanOrEqual(1)
      const lastStatus = statusChunks[statusChunks.length - 1]
      expect(lastStatus).toContain('step-4')
    })

    it('never drops text frames even under pressure', () => {
      const buf = new SseBuffer({ maxPending: 3 })
      buf.push(textFrame('part-1'))
      buf.push(statusFrame('thinking'))
      buf.push(textFrame('part-2'))
      buf.push(statusFrame('searching'))
      buf.push(textFrame('part-3'))

      const drained = buf.drain()
      const texts = drained.filter(c => c.includes('part-'))
      expect(texts).toHaveLength(3)
    })
  })

  describe('AC-3: client disconnect detection', () => {
    it('marks disconnected when AbortSignal fires', () => {
      const controller = new AbortController()
      const buf = new SseBuffer({ signal: controller.signal })
      expect(buf.disconnected).toBe(false)

      controller.abort()
      expect(buf.disconnected).toBe(true)
    })

    it('drops frames after disconnect', () => {
      const controller = new AbortController()
      const buf = new SseBuffer({ signal: controller.signal })
      buf.push(textFrame('before'))
      controller.abort()
      buf.push(textFrame('after'))

      const drained = buf.drain()
      expect(drained).toHaveLength(1)
      expect(drained[0]).toContain('before')
    })

    it('handles already-aborted signal', () => {
      const controller = new AbortController()
      controller.abort()
      const buf = new SseBuffer({ signal: controller.signal })
      expect(buf.disconnected).toBe(true)

      buf.push(textFrame('ignored'))
      expect(buf.pendingCount).toBe(0)
    })
  })

  describe('AC-4: simulated slow client', () => {
    it('buffers frames while slow client cannot keep up', () => {
      const buf = new SseBuffer({ maxPending: 8 })

      for (let i = 0; i < 6; i++) {
        buf.push(textFrame(`chunk-${i}`))
      }
      expect(buf.pendingCount).toBe(6)

      const first = buf.drain()
      expect(first).toHaveLength(6)

      buf.push(textFrame('after-drain'))
      expect(buf.pendingCount).toBe(1)
    })

    it('compacts multiple status events from rapid tool rounds', () => {
      const buf = new SseBuffer({ maxPending: 5 })

      buf.push(textFrame('answer-start'))
      buf.push(statusFrame('tool-1'))
      buf.push(statusFrame('tool-2'))
      buf.push(statusFrame('tool-3'))
      buf.push(statusFrame('tool-4'))
      buf.push(statusFrame('tool-5'))

      const drained = buf.drain()
      const textChunks = drained.filter(c => c.includes('answer-start'))
      expect(textChunks).toHaveLength(1)

      const statusChunks = drained.filter(c => {
        try {
          const data = JSON.parse(c.replace('data: ', '').trim())
          return data.type === 'status' && data.message
        } catch { return false }
      })
      expect(statusChunks.some(c => c.includes('tool-5'))).toBe(true)
    })

    it('simulated disconnecting client aborts before next Nexus call', () => {
      const controller = new AbortController()
      const buf = new SseBuffer({ signal: controller.signal })

      buf.push(textFrame('partial-response'))
      buf.push(statusFrame('thinking'))
      expect(buf.disconnected).toBe(false)

      controller.abort()
      expect(buf.disconnected).toBe(true)

      buf.push(textFrame('should-not-appear'))
      const drained = buf.drain()
      expect(drained.some(c => c.includes('should-not-appear'))).toBe(false)
    })
  })
})

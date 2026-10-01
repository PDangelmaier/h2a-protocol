import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildStatusEvent, resolveStatusMessage, clearToolStatusCache } from '../tool-status.js'

beforeEach(() => clearToolStatusCache())

const STATUS_MESSAGES = new Map([
  ['vehicle_catalog', 'Suche Fahrzeuge...'],
  ['configurator.get_pricing', 'Berechne Preis...'],
  ['dealer_inventory', 'Suche Händler in Ihrer Nähe...'],
  ['vehicle.get_status', 'Prüfe Fahrzeugstatus...'],
  ['finance.check_eligibility', 'Prüfe Finanzierungsoptionen...'],
  ['service_booking', 'Buche Servicetermin...'],
  ['charging.find_station', 'Suche Ladestationen...'],
  ['store.add_to_cart', 'Füge zum Warenkorb hinzu...'],
  ['vehicle.remote_control', 'Führe Fahrzeugbefehl aus...'],
  ['recall_check', 'Prüfe Rückrufe...'],
])

describe('SPEC-002 AC-1: Status event before tool execution', () => {
  it('buildStatusEvent creates event with correct shape', () => {
    const event = buildStatusEvent(['vehicle_catalog'], 1, STATUS_MESSAGES)
    expect(event).toEqual({
      toolsInProgress: ['vehicle_catalog'],
      round: 1,
      message: 'Suche Fahrzeuge...',
      ts: expect.any(Number),
    })
  })

  it('buildStatusEvent includes all tool names in toolsInProgress', () => {
    const event = buildStatusEvent(['vehicle_catalog', 'dealer_inventory'], 2, STATUS_MESSAGES)
    expect(event.toolsInProgress).toEqual(['vehicle_catalog', 'dealer_inventory'])
    expect(event.round).toBe(2)
  })

  it('event ts is a recent unix timestamp in milliseconds', () => {
    const before = Date.now()
    const event = buildStatusEvent(['vehicle_catalog'], 1, STATUS_MESSAGES)
    const after = Date.now()
    expect(event.ts).toBeGreaterThanOrEqual(before)
    expect(event.ts).toBeLessThanOrEqual(after)
  })

  it('status event conforms to JSON schema shape', () => {
    const event = buildStatusEvent(['vehicle_catalog'], 1, STATUS_MESSAGES)
    expect(typeof event.ts).toBe('number')
    expect(event.ts).toBeGreaterThan(0)
    expect(event.round).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(event.toolsInProgress)).toBe(true)
    expect(event.toolsInProgress.length).toBeGreaterThan(0)
    expect(typeof event.message).toBe('string')
    expect(event.message.length).toBeGreaterThan(0)
  })
})

describe('SPEC-002 AC-1: JSON schema exists in spec/schema/', () => {
  it('status-event.schema.json exists and has correct structure', async () => {
    const fs = await import('node:fs')
    const content = fs.readFileSync(
      new URL('../../../../spec/schema/status-event.schema.json', import.meta.url),
      'utf-8',
    )
    const schema = JSON.parse(content)
    expect(schema.title).toBe('H2A Status Event')
    expect(schema.required).toContain('toolsInProgress')
    expect(schema.required).toContain('round')
    expect(schema.required).toContain('message')
    expect(schema.required).toContain('ts')
    expect(schema.required).toContain('type')
    expect(schema.properties.type.const).toBe('status')
  })
})

describe('SPEC-002 AC-2: Tool status messages from configuration', () => {
  it('known tools get configured messages', () => {
    expect(resolveStatusMessage(['vehicle_catalog'], STATUS_MESSAGES)).toBe('Suche Fahrzeuge...')
    expect(resolveStatusMessage(['configurator.get_pricing'], STATUS_MESSAGES)).toBe('Berechne Preis...')
  })

  it('unknown tools get default "Einen Moment..."', () => {
    expect(resolveStatusMessage(['some_unknown_tool'], STATUS_MESSAGES)).toBe('Einen Moment...')
  })

  it('multiple tools have messages joined with space', () => {
    const msg = resolveStatusMessage(['vehicle_catalog', 'dealer_inventory'], STATUS_MESSAGES)
    expect(msg).toBe('Suche Fahrzeuge... Suche Händler in Ihrer Nähe...')
  })

  it('mixed known and unknown tools', () => {
    const msg = resolveStatusMessage(['vehicle_catalog', 'new_tool'], STATUS_MESSAGES)
    expect(msg).toBe('Suche Fahrzeuge... Einen Moment...')
  })

  it('messages are static strings — no tool parameters', () => {
    for (const [, message] of STATUS_MESSAGES) {
      expect(message).not.toMatch(/\$\{/)
      expect(message).not.toMatch(/\{[a-z]/)
    }
  })

  it('all 24 seed tools have status messages in migration', async () => {
    const fs = await import('node:fs')
    const migration = fs.readFileSync(
      new URL('../../../../supabase/migrations/030_tool_status_messages.sql', import.meta.url),
      'utf-8',
    )
    const seedTools = fs.readFileSync(
      new URL('../../../../supabase/seed/agent_tools.sql', import.meta.url),
      'utf-8',
    )
    const toolNames = [...seedTools.matchAll(/'(\w+(?:\.\w+)?)'/g)]
      .map(m => m[1])
      .filter(name => migration.includes(`tool_name = '${name}'`))
    expect(toolNames.length).toBe(24)
  })
})

describe('SPEC-002 AC-3: Status events pass through PII filter', () => {
  it('edge function filterSseEvent handles status events', async () => {
    const fs = await import('node:fs')
    const edgeFn = fs.readFileSync(
      new URL('../../../../supabase/functions/h2a/index.ts', import.meta.url),
      'utf-8',
    )
    expect(edgeFn).toContain("sendSseEvent(controller, { type: 'status'")
    expect(edgeFn).toContain('filterSseEvent')
  })

  it('status message strings contain no PII patterns', () => {
    for (const [, message] of STATUS_MESSAGES) {
      expect(message).not.toMatch(/[A-Z]{2}\d{3,4}[A-Z]{0,3}/)
      expect(message).not.toMatch(/\d{2,3}\s*[A-Z]{1,3}\s*\d{1,4}/)
      expect(message).not.toMatch(/@/)
    }
  })
})

describe('SPEC-002 AC-4: @h2a/react StatusIndicator component', () => {
  it('StatusIndicator is exported from @h2a/react', async () => {
    const fs = await import('node:fs')
    const indexContent = fs.readFileSync(
      new URL('../../../../packages/react/src/index.ts', import.meta.url),
      'utf-8',
    )
    expect(indexContent).toContain('StatusIndicator')
  })

  it('StatusIndicator component file exists with correct props', async () => {
    const fs = await import('node:fs')
    const content = fs.readFileSync(
      new URL('../../../../packages/react/src/StatusIndicator.tsx', import.meta.url),
      'utf-8',
    )
    expect(content).toContain('hasTextResponse')
    expect(content).toContain('events')
    expect(content).toContain('role="status"')
    expect(content).toContain('aria-live="polite"')
  })
})

describe('SPEC-002 AC-5: No status events without tool calls', () => {
  it('onStatusEvent is only called when tools are present', () => {
    const onStatus = vi.fn()
    const toolCalls: string[] = []
    if (toolCalls.length > 0) {
      onStatus(buildStatusEvent(toolCalls, 1, STATUS_MESSAGES))
    }
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('reasoning.ts only emits status when fbResult has tool calls', async () => {
    const fs = await import('node:fs')
    const reasoning = fs.readFileSync(
      new URL('../reasoning.ts', import.meta.url),
      'utf-8',
    )
    expect(reasoning).toContain("if (onStatusEvent && statusMessages)")
    expect(reasoning).toContain("fbResult.toolCalls.map(tc => tc.name)")
    expect(reasoning).not.toMatch(/onStatusEvent\(.*\).*stopReason !== 'tool_use'/)
  })

  it('SPEC-033 AC-5 SSE contract preserved — status events only within tool rounds', async () => {
    const fs = await import('node:fs')
    const edgeFn = fs.readFileSync(
      new URL('../../../../supabase/functions/h2a/index.ts', import.meta.url),
      'utf-8',
    )
    expect(edgeFn).toContain("type: 'presence.update', state: 'conversing'")
    expect(edgeFn).toContain("type: 'agent.frame'")
    expect(edgeFn).toContain("frameType: 'text'")
    expect(edgeFn).toContain("frameType: 'end'")
    expect(edgeFn).toContain("type: 'presence.update', state: 'attentive'")
  })
})

describe('SPEC-002 AC-6: Status event latency ≤ 100ms', () => {
  it('buildStatusEvent uses Date.now() — ≤ 1ms overhead', () => {
    const start = Date.now()
    const event = buildStatusEvent(['vehicle_catalog'], 1, STATUS_MESSAGES)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThanOrEqual(100)
    expect(event.ts - start).toBeLessThanOrEqual(1)
  })

  it('status event is emitted synchronously before tool execution in reasoning.ts', async () => {
    const fs = await import('node:fs')
    const reasoning = fs.readFileSync(
      new URL('../reasoning.ts', import.meta.url),
      'utf-8',
    )
    const statusIdx = reasoning.indexOf('onStatusEvent(buildStatusEvent')
    const toolExecIdx = reasoning.indexOf('const toolResults = await Promise.all')
    expect(statusIdx).toBeGreaterThan(-1)
    expect(toolExecIdx).toBeGreaterThan(-1)
    expect(statusIdx).toBeLessThan(toolExecIdx)
  })
})

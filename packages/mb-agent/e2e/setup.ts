import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'
import { invalidateModelCache, invalidatePricingCache } from '../src/model-config.js'
import { clearConsentCache } from '../src/consent.js'
import { invalidatePromptCacheConfig } from '../src/prompt-cache.js'
import { invalidateRoutingConfig } from '../src/turn-classifier.js'
import type { HandlerEnv } from '../src/handler.js'

export const E2E_SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? ''
export const E2E_SUPABASE_SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY ?? ''
const NEXUS_FAKE_ENDPOINT = 'http://nexus-e2e-mock.local'

export function getSupabase(): SupabaseClient {
  return createClient(E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_KEY)
}

export function buildHandlerEnv(): HandlerEnv {
  return {
    supabaseUrl: E2E_SUPABASE_URL,
    supabaseServiceKey: E2E_SUPABASE_SERVICE_KEY,
    nexusEndpoint: NEXUS_FAKE_ENDPOINT,
    nexusToken: 'e2e-fake-token',
  }
}

export interface SessionFixture {
  sessionId: string
  dbId: string
  profileId: string
}

export async function createTestSession(supabase: SupabaseClient): Promise<SessionFixture> {
  const profileId = crypto.randomUUID()
  const sessionId = `e2e-${crypto.randomUUID()}`
  const dbId = crypto.randomUUID()

  await supabase.from('customer_profiles').insert({
    id: profileId,
    pid_score: 50,
    identity_tier: 'recognized',
    locale: 'de-DE',
    display_name: 'E2E Testuser',
  })

  await supabase.from('sessions').insert({
    id: dbId,
    h2a_session_id: sessionId,
    customer_id: profileId,
    channel: 'web',
    journey_phase: 'research',
    status: 'active',
    channel_metadata: { market: 'de', locale: 'de-DE' },
  })

  return { sessionId, dbId, profileId }
}

export function invalidateAllCaches() {
  invalidateModelCache()
  invalidatePricingCache()
  clearConsentCache()
  invalidatePromptCacheConfig()
  invalidateRoutingConfig()
}

export async function cleanupSession(supabase: SupabaseClient, fixture: SessionFixture) {
  await supabase.from('analytics_events').delete().eq('session_id', fixture.dbId)
  await supabase.from('conversation_turns').delete().eq('session_id', fixture.dbId)
  await supabase.from('conversations').delete().eq('h2a_session_id', fixture.sessionId)
  await supabase.from('agent_memories').delete().eq('profile_id', fixture.profileId)
  await supabase.from('sessions').delete().eq('id', fixture.dbId)
  await supabase.from('customer_profiles').delete().eq('id', fixture.profileId)
}

interface NexusSyncResponse {
  output: {
    message: {
      content: Array<
        | { text: string }
        | { toolUse: { toolUseId: string; name: string; input: Record<string, unknown> } }
      >
    }
  }
  stopReason: string
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens?: number }
}

export interface NexusMock {
  queue: Array<NexusSyncResponse | { status: number; body: string }>
  requests: Array<{ url: string; body: Record<string, unknown> }>
  enqueueText: (text: string) => void
  enqueueToolUse: (toolUseId: string, toolName: string, input: Record<string, unknown>) => void
  enqueueError: (status: number, message: string) => void
  install: () => void
  restore: () => void
}

export function createNexusMock(): NexusMock {
  const originalFetch = globalThis.fetch
  const mock: NexusMock = {
    queue: [],
    requests: [],

    enqueueText(text: string) {
      mock.queue.push({
        output: { message: { content: [{ text }] } },
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0 },
      })
    },

    enqueueToolUse(toolUseId: string, toolName: string, input: Record<string, unknown>) {
      mock.queue.push({
        output: {
          message: {
            content: [{ toolUse: { toolUseId, name: toolName, input } }],
          },
        },
        stopReason: 'tool_use',
        usage: { inputTokens: 150, outputTokens: 80, cacheReadInputTokens: 0 },
      })
    },

    enqueueError(status: number, message: string) {
      mock.queue.push({ status, body: message })
    },

    install() {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()

        if (url.includes(NEXUS_FAKE_ENDPOINT)) {
          const body = init?.body ? JSON.parse(init.body as string) : {}
          mock.requests.push({ url, body })

          const next = mock.queue.shift()
          if (!next) {
            return new Response('No queued response', { status: 500 })
          }

          if ('status' in next) {
            return new Response(next.body, { status: next.status })
          }

          return new Response(JSON.stringify(next), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const rewritten = url.replace('/rest/v1/', '/')
        if (rewritten !== url) {
          return originalFetch(rewritten, init)
        }
        return originalFetch(input, init)
      }) as typeof fetch
    },

    restore() {
      globalThis.fetch = originalFetch
    },
  }
  return mock
}

export interface SseEvent {
  type: string
  [key: string]: unknown
}

export async function parseSseStream(response: Response): Promise<SseEvent[]> {
  const events: SseEvent[] = []
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n\n')
    buffer = lines.pop()!

    for (const chunk of lines) {
      const trimmed = chunk.trim()
      if (!trimmed) continue
      const dataPrefix = 'data: '
      const dataLine = trimmed.split('\n').find(l => l.startsWith(dataPrefix))
      if (dataLine) {
        try {
          events.push(JSON.parse(dataLine.slice(dataPrefix.length)))
        } catch { /* ignore malformed */ }
      }
    }
  }

  if (buffer.trim()) {
    const dataLine = buffer.trim().split('\n').find(l => l.startsWith('data: '))
    if (dataLine) {
      try {
        events.push(JSON.parse(dataLine.slice(6)))
      } catch { /* ignore */ }
    }
  }

  return events
}

export function buildStreamRequest(sessionId: string, text: string, baseUrl = 'http://localhost'): Request {
  return new Request(`${baseUrl}/h2a/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-H2A-Session': sessionId,
    },
    body: JSON.stringify({ text }),
  })
}

export function buildSessionOpenRequest(body: Record<string, unknown>, baseUrl = 'http://localhost'): Request {
  return new Request(`${baseUrl}/h2a/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'session.open', ...body }),
  })
}

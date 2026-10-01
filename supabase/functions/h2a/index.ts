import { createClient } from '@supabase/supabase-js'
import { reasoningLoop, filterPii } from '@h2a/mb-agent'
import type { PiiHit } from '@h2a/mb-agent'

const REQUIRED_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXUS_ENDPOINT', 'NEXUS_PRD_KEY'] as const
const OPTIONAL_VARS = ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL'] as const

const missing = REQUIRED_VARS.filter(v => !Deno.env.get(v))
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}`)
}

const optionalMissing = OPTIONAL_VARS.filter(v => !Deno.env.get(v))
if (optionalMissing.length > 0) {
  console.warn(`[h2a] Langfuse disabled — missing: ${optionalMissing.join(', ')}`)
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const NEXUS_ENDPOINT = Deno.env.get('NEXUS_ENDPOINT')!
const NEXUS_TOKEN = Deno.env.get('NEXUS_PRD_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-h2a-session, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/h2a/, '')

  try {
    if (path === '/session' && req.method === 'POST') {
      return await handleSession(req)
    }
    if (path === '/signal' && req.method === 'POST') {
      return await handleSignal(req)
    }
    if (path === '/stream' && req.method === 'POST') {
      return await handleStream(req)
    }
    if (path.startsWith('/admin/models')) {
      return await handleAdminModels(req, path)
    }
    return jsonResponse({ error: 'Not found' }, 404)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return jsonResponse({ error: message }, 500)
  }
})

async function handleSession(req: Request): Promise<Response> {
  const body = await req.json()
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  if (body.type === 'session.open') {
    const sessionId = crypto.randomUUID()
    const { error } = await supabase.from('sessions').insert({
      h2a_session_id: sessionId,
      customer_id: body.customerId ?? null,
      channel: body.channel ?? 'web',
      status: 'active',
      presence_state: 'attentive',
      journey_phase: body.journeyPhase ?? 'awareness',
      conformance_level: body.hostCapabilities?.conformanceLevel ?? 'standard',
    })
    if (error) return jsonResponse({ error: error.message }, 400)

    return jsonResponse({
      type: 'session.ack',
      sessionId,
      negotiatedCapabilities: {
        rendering: body.hostCapabilities?.rendering ?? ['text'],
        conformanceLevel: body.hostCapabilities?.conformanceLevel ?? 'standard',
        stateSync: body.hostCapabilities?.stateSync ?? false,
      },
    })
  }

  if (body.type === 'session.resume') {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, h2a_session_id, status')
      .eq('h2a_session_id', body.sessionId)
      .single()

    if (error || !data) return jsonResponse({ error: 'Session not found' }, 404)
    if (data.status === 'ended') return jsonResponse({ error: 'Session ended' }, 410)

    await supabase
      .from('sessions')
      .update({ status: 'active', last_activity_at: new Date().toISOString() })
      .eq('id', data.id)

    return jsonResponse({ type: 'session.ack', sessionId: data.h2a_session_id })
  }

  return jsonResponse({ error: 'Unknown session type' }, 400)
}

async function handleSignal(req: Request): Promise<Response> {
  const sessionId = req.headers.get('X-H2A-Session')
  if (!sessionId) return jsonResponse({ error: 'Missing X-H2A-Session header' }, 401)

  const body = await req.json()
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: session } = await supabase
    .from('sessions')
    .select('id, customer_id, channel, journey_phase, intent_score')
    .eq('h2a_session_id', sessionId)
    .eq('status', 'active')
    .single()

  if (!session) return jsonResponse({ error: 'Invalid or inactive session' }, 404)

  await supabase.from('sessions').update({ last_activity_at: new Date().toISOString() }).eq('id', session.id)

  if (body.signalType === 'context_change') {
    await supabase.from('behavioral_signals').insert({
      customer_id: session.customer_id,
      session_id: session.id,
      signal_type: 'context_change',
      channel: session.channel,
      payload: body.content,
    })
    return jsonResponse({ type: 'signal.ack', status: 'received' })
  }

  if (body.signalType === 'message') {
    return jsonResponse({ type: 'signal.ack', status: 'processing', hint: 'Use /stream for response' })
  }

  await supabase.from('behavioral_signals').insert({
    customer_id: session.customer_id,
    session_id: session.id,
    signal_type: body.signalType,
    channel: session.channel,
    payload: body.content,
  })

  return jsonResponse({ type: 'signal.ack', status: 'received' })
}

async function handleStream(req: Request): Promise<Response> {
  const sessionId = req.headers.get('X-H2A-Session')
  if (!sessionId) return jsonResponse({ error: 'Missing X-H2A-Session header' }, 401)

  const body = await req.json()
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: session } = await supabase
    .from('sessions')
    .select('id, customer_id, channel, journey_phase, intent_score')
    .eq('h2a_session_id', sessionId)
    .eq('status', 'active')
    .single()

  if (!session) return jsonResponse({ error: 'Invalid or inactive session' }, 404)

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('display_name, pid_score, locale, market')
    .eq('id', session.customer_id)
    .single()

  const { data: recentTurns } = await supabase
    .from('conversation_turns')
    .select('role, content')
    .eq('session_id', session.id)
    .order('sequence', { ascending: true })
    .limit(20)

  const conversationHistory = (recentTurns ?? []).map(t => ({
    role: t.role as 'user' | 'assistant',
    content: typeof t.content === 'string' ? t.content : (t.content as { text?: string })?.text ?? JSON.stringify(t.content),
  }))

  const sessionState = {
    id: session.id,
    profileId: session.customer_id ?? '',
    channel: (session.channel ?? 'web') as 'web' | 'smart_storefront' | 'whatsapp' | 'mbux' | 'voice' | 'app' | 'dealer',
    locale: profile?.locale ?? 'de-AT',
    market: profile?.market ?? 'de',
    journeyPhase: (session.journey_phase ?? 'awareness') as 'awareness' | 'research' | 'configuration' | 'pricing' | 'purchase' | 'order' | 'onboarding' | 'ownership' | 'service' | 'lifecycle',
    pidScore: profile?.pid_score ?? 0,
    conversationHistory,
  }

  const agentConfig = {
    supabaseUrl: SUPABASE_URL,
    supabaseServiceKey: SUPABASE_SERVICE_KEY,
    nexus: {
      endpoint: NEXUS_ENDPOINT,
      bearerToken: NEXUS_TOKEN,
    },
    market: profile?.market ?? 'de',
    defaultLocale: profile?.locale ?? 'de-AT',
  }

  const userSignal = {
    type: 'message',
    content: body.text ?? '',
    timestamp: new Date(),
  }

  const encoder = new TextEncoder()

  function sendSseEvent(controller: ReadableStreamDefaultController, event: Record<string, unknown>): void {
    const filtered = filterSseEvent(event)
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(filtered.event)}\n\n`))
    if (filtered.piiHits.length > 0) {
      const piiEvent = { type: 'pii_masked', hits: filtered.piiHits }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(piiEvent)}\n\n`))
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      sendSseEvent(controller, { type: 'presence.update', state: 'conversing' })

      try {
        const result = await reasoningLoop(sessionState, userSignal, agentConfig)

        if (result.securityEvents && result.securityEvents.length > 0) {
          for (const ev of result.securityEvents) {
            sendSseEvent(controller, { type: 'security_event', eventType: ev.type })
          }
        }

        if (result.degraded) {
          sendSseEvent(controller, { type: 'degraded_response', reason: result.degraded.reason })
        }

        sendSseEvent(controller, {
          type: 'agent.frame',
          frameType: 'text',
          content: { text: result.response, streaming: false },
        })

        sendSseEvent(controller, { type: 'agent.frame', frameType: 'end', content: {} })
        sendSseEvent(controller, { type: 'presence.update', state: 'attentive' })
      } catch (err) {
        sendSseEvent(controller, { type: 'agent.frame', frameType: 'error', content: { message: 'An unexpected error occurred' } })
        sendSseEvent(controller, { type: 'agent.frame', frameType: 'end', content: {} })
        sendSseEvent(controller, { type: 'presence.update', state: 'attentive' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}


async function verifyAdminIdentity(req: Request): Promise<{ identity: string } | { error: string; status: 401 | 403 }> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return { error: 'Missing admin authorization', status: 401 }

  const token = auth.slice(7)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) return { error: 'Invalid or expired token', status: 401 }
  if (user.app_metadata?.role !== 'admin') return { error: 'Admin role required', status: 403 }

  return { identity: user.email ?? user.id }
}

async function handleAdminModels(req: Request, path: string): Promise<Response> {
  const authResult = await verifyAdminIdentity(req)
  if ('error' in authResult) return jsonResponse({ error: authResult.error }, authResult.status)
  const identity = authResult.identity

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  if (path === '/admin/models' && req.method === 'GET') {
    const { data, error } = await supabase
      .from('model_config')
      .select('*')
      .order('purpose')
      .order('created_at', { ascending: false })

    if (error) return jsonResponse({ error: error.message }, 500)
    return jsonResponse(data)
  }

  if (path === '/admin/models/register' && req.method === 'POST') {
    const body = await req.json()
    if (!body.purpose || !body.modelId) {
      return jsonResponse({ error: 'purpose and modelId required' }, 400)
    }

    const { data, error } = await supabase
      .from('model_config')
      .insert({ purpose: body.purpose, model_id: body.modelId })
      .select()
      .single()

    if (error) return jsonResponse({ error: error.message }, 400)
    return jsonResponse(data, 201)
  }

  if (path === '/admin/models/activate' && req.method === 'POST') {
    const body = await req.json()
    if (!body.configId) return jsonResponse({ error: 'configId required' }, 400)
    if (body.evalScore == null && !body.overrideReason) {
      return jsonResponse({ error: 'eval_score or override_reason required' }, 400)
    }

    const { data: target } = await supabase
      .from('model_config')
      .select('*')
      .eq('id', body.configId)
      .single()

    if (!target) return jsonResponse({ error: 'Config not found' }, 404)

    const { data: prev } = await supabase
      .from('model_config')
      .select('*')
      .eq('purpose', target.purpose)
      .eq('is_active', true)
      .maybeSingle()

    if (prev) {
      await supabase.from('model_config').update({ is_active: false }).eq('id', prev.id)
    }

    const { data: activated, error } = await supabase
      .from('model_config')
      .update({
        is_active: true,
        activated_at: new Date().toISOString(),
        activated_by: identity,
        eval_score: body.evalScore ?? null,
        override_reason: body.overrideReason ?? null,
      })
      .eq('id', body.configId)
      .select()
      .single()

    if (error) return jsonResponse({ error: error.message }, 500)

    return jsonResponse({
      previous: prev ?? null,
      activated,
    })
  }

  if (path === '/admin/models/rollback' && req.method === 'POST') {
    const body = await req.json()
    if (!body.purpose) return jsonResponse({ error: 'purpose required' }, 400)

    const { data: configs } = await supabase
      .from('model_config')
      .select('*')
      .eq('purpose', body.purpose)
      .order('activated_at', { ascending: false, nullsFirst: false })
      .limit(2)

    const rows = configs ?? []
    const current = rows.find((r: { is_active: boolean }) => r.is_active)
    const previous = rows.find((r: { is_active: boolean }) => !r.is_active)

    if (!previous) return jsonResponse({ error: 'No previous model to rollback to' }, 400)

    if (current) {
      await supabase.from('model_config').update({ is_active: false }).eq('id', current.id)
    }

    const { data: rolledBack, error } = await supabase
      .from('model_config')
      .update({
        is_active: true,
        activated_at: new Date().toISOString(),
        activated_by: identity,
        override_reason: `Rollback from ${current?.model_id ?? 'unknown'}`,
      })
      .eq('id', previous.id)
      .select()
      .single()

    if (error) return jsonResponse({ error: error.message }, 500)
    return jsonResponse(rolledBack)
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

function filterSseEvent(event: Record<string, unknown>): { event: Record<string, unknown>; piiHits: PiiHit[] } {
  const allHits: PiiHit[] = []

  function filterValue(val: unknown): unknown {
    if (typeof val === 'string') {
      const { text, hits } = filterPii(val)
      allHits.push(...hits)
      return text
    }
    if (Array.isArray(val)) return val.map(filterValue)
    if (val !== null && typeof val === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        out[k] = filterValue(v)
      }
      return out
    }
    return val
  }

  const filtered = filterValue(event) as Record<string, unknown>
  return { event: filtered, piiHits: allHits }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

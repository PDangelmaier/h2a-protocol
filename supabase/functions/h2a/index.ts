import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const NEXUS_ENDPOINT = Deno.env.get('NEXUS_ENDPOINT')!
const NEXUS_TOKEN = Deno.env.get('NEXUS_BEARER_TOKEN')!

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
    .select('id, customer_id, channel, journey_phase, intent_score, active_personality_id')
    .eq('h2a_session_id', sessionId)
    .eq('status', 'active')
    .single()

  if (!session) return jsonResponse({ error: 'Invalid or inactive session' }, 404)

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('display_name, pid_score, locale')
    .eq('id', session.customer_id)
    .single()

  const { data: recentTurns } = await supabase
    .from('conversation_turns')
    .select('role, content')
    .eq('session_id', session.id)
    .order('sequence', { ascending: true })
    .limit(20)

  const history = (recentTurns ?? []).map(t => ({
    role: t.role as string,
    content: [{ text: typeof t.content === 'string' ? t.content : JSON.stringify(t.content) }],
  }))

  const systemPrompt = buildMinimalSystemPrompt(
    profile?.display_name,
    profile?.locale ?? 'de-AT',
    session.channel,
    session.journey_phase,
    profile?.pid_score ?? 0,
  )

  const nexusBody = {
    system: [{ text: systemPrompt }],
    messages: [
      ...history,
      { role: 'user', content: [{ text: body.text ?? '' }] },
    ],
    inferenceConfig: { temperature: 0.3, maxTokens: 2048 },
  }

  const mainModelId = await resolveActiveModel('main', supabase)
  const nexusResponse = await fetch(`${NEXUS_ENDPOINT}/model/${mainModelId}/converse-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${NEXUS_TOKEN}`,
    },
    body: JSON.stringify(nexusBody),
  })

  if (!nexusResponse.ok) {
    const errText = await nexusResponse.text()
    return jsonResponse({ error: `Nexus error: ${errText}` }, nexusResponse.status)
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = nexusResponse.body!.getReader()
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()
      let fullText = ''
      let sequence = (recentTurns?.length ?? 0) + 1

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'presence.update', state: 'conversing' })}\n\n`))

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const textDelta = extractTextDelta(chunk)
          if (textDelta) {
            fullText += textDelta
            const frame = {
              type: 'agent.frame',
              frameType: 'text',
              content: { text: textDelta, streaming: true },
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`))
          }
        }

        const endFrame = { type: 'agent.frame', frameType: 'end', content: {} }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(endFrame)}\n\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'presence.update', state: 'attentive' })}\n\n`))

        await persistStreamedTurn(supabase, session.id, body.text ?? '', fullText, sequence)
      } catch (err) {
        const errFrame = { type: 'agent.frame', frameType: 'error', content: { message: String(err) } }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errFrame)}\n\n`))
      } finally {
        reader.releaseLock()
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

function buildMinimalSystemPrompt(
  displayName: string | null | undefined,
  locale: string,
  channel: string,
  journeyPhase: string,
  pidScore: number,
): string {
  const parts = [
    'Du bist der Mercedes-Benz Assistent. Freundlich, kompetent, markentreu.',
    `Sprache: ${locale}. Kanal: ${channel}. Journey-Phase: ${journeyPhase}. PID: ${pidScore}/100.`,
  ]
  if (displayName) parts.push(`Anrede: ${displayName}.`)
  parts.push(
    'Regeln: Keine erfundenen Preise. Bei Unsicherheit an Händler verweisen. DSGVO einhalten.',
  )
  return parts.join('\n')
}

function extractTextDelta(chunk: string): string | null {
  const lines = chunk.split('\n').filter(l => l.startsWith('{'))
  let text = ''
  for (const line of lines) {
    try {
      const event = JSON.parse(line)
      if (event.delta?.text) text += event.delta.text
      if (event.contentBlockDelta?.delta?.text) text += event.contentBlockDelta.delta.text
    } catch { /* incomplete JSON, skip */ }
  }
  return text || null
}

async function persistStreamedTurn(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  userText: string,
  assistantText: string,
  sequence: number,
): Promise<void> {
  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .single()
  if (!session) return

  let conversationId: string

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('h2a_session_id', sessionId)
    .limit(1)
    .maybeSingle()

  if (existing) {
    conversationId = existing.id
  } else {
    const { data: conv } = await supabase
      .from('conversations')
      .insert({ h2a_session_id: sessionId, profile_id: session.id, channel: 'web' })
      .select('id')
      .single()
    conversationId = conv!.id
  }

  await supabase.from('conversation_turns').insert([
    {
      conversation_id: conversationId,
      session_id: sessionId,
      role: 'user',
      content: { text: userText },
      sequence,
    },
    {
      conversation_id: conversationId,
      session_id: sessionId,
      role: 'assistant',
      content: { text: assistantText },
      sequence: sequence + 1,
    },
  ])

  await supabase
    .from('conversations')
    .update({ turn_count: sequence + 1 })
    .eq('id', conversationId)
}

type ModelPurpose = 'main' | 'tool-routing' | 'memory-extraction' | 'evaluation'

async function resolveActiveModel(
  purpose: ModelPurpose,
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const { data, error } = await supabase
    .from('model_config')
    .select('model_id')
    .eq('purpose', purpose)
    .eq('is_active', true)
    .single()

  if (error || !data) throw new Error(`No active model for purpose "${purpose}"`)
  return data.model_id
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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

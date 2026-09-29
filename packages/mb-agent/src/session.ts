import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentConfig, Channel, ChannelMetadata, SessionStatus } from './types.js'
import { resolveIdentity } from './identity.js'

interface Session {
  id: string
  profileId: string
  channel: Channel
  status: SessionStatus
  identityTier: string
  pidScore: number
}

interface UserSignal {
  type: string
  content?: unknown
}

export async function createSession(
  signal: UserSignal,
  channel: Channel,
  meta: ChannelMetadata,
  config: AgentConfig,
): Promise<Session> {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey)

  const identity = await resolveIdentity(channel, meta, supabase)

  const h2aSessionId = crypto.randomUUID()

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      h2a_session_id: h2aSessionId,
      customer_id: identity.profileId,
      channel,
      status: 'active' satisfies SessionStatus,
      intent_score: 0,
      channel_metadata: { initialSignal: signal.type, locale: config.defaultLocale, market: config.market },
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`Session creation failed: ${error?.message}`)

  return {
    id: data.id,
    profileId: identity.profileId,
    channel,
    status: 'active',
    identityTier: identity.identityTier,
    pidScore: identity.pidScore,
  }
}

export async function pauseSession(
  sessionId: string,
  reason: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'paused' satisfies SessionStatus, pause_reason: reason, paused_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('status', 'active')

  if (error) throw new Error(`Pause failed: ${error.message}`)
}

export async function resumeSession(
  profileId: string,
  newChannel: Channel,
  supabase: SupabaseClient,
): Promise<Session> {
  const { data } = await supabase
    .from('sessions')
    .select('id, channel, intent_score')
    .eq('customer_id', profileId)
    .eq('status', 'paused')
    .order('paused_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) throw new Error('No paused session found')

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('pid_score, identity_tier')
    .eq('id', profileId)
    .single()

  await supabase
    .from('sessions')
    .update({ status: 'active', channel: newChannel, last_activity_at: new Date().toISOString() })
    .eq('id', data.id)

  return {
    id: data.id,
    profileId,
    channel: newChannel,
    status: 'active',
    identityTier: profile?.identity_tier ?? 'anonymous',
    pidScore: profile?.pid_score ?? 0,
  }
}

export async function endSession(sessionId: string, supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'ended' satisfies SessionStatus, ended_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) throw new Error(`End session failed: ${error.message}`)
}

export async function transferSession(
  sessionId: string,
  target: { type: 'agent' | 'human'; id: string },
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({
      status: 'transferred' satisfies SessionStatus,
      transfer_target: `${target.type}:${target.id}`,
      ended_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  if (error) throw new Error(`Transfer failed: ${error.message}`)
}

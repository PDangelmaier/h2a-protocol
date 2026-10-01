import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentConfig, CustomerContext, IntentSnapshot, NexusConfig } from './types.js'
import { buildSystemPrompt, buildSystemPromptSplit, resolvePersonality } from './ccp.js'
import type { ResolvedPersonalityWithVersion, PromptBuild } from './ccp.js'
import { computeIntentScore, scoreToProactivity } from './isp.js'
import { loadAgentMemories, persistMemory } from './memory.js'
import { trackPersistTurnFailed, trackPromptCacheRejected, trackRoutingDecision, getLangfuseConfig } from './langfuse.js'
import { resolveModel, resolveFallbackChain } from './model-config.js'
import type { FallbackChainEntry } from './model-config.js'
import { callNexusSync } from './nexus.js'
import type { NexusRequest } from './nexus.js'
import { FallbackChainExhaustedError, FallbackTimeoutError } from './fallback.js'
import { executeToolWithConsent, formatToolsForNexus, getAvailableTools, getToolMaxTokens } from './tools.js'
import { buildToolError } from './tool-errors.js'
import { truncateToolResult } from './truncation.js'
import { loadGrantedConsents } from './consent.js'
import { sanitizeInput } from './input-sanitizer.js'
import { buildDegradedResponse, formatDegradedForCustomer } from './degradation.js'
import type { DegradationReason } from './degradation.js'
import { buildCanary, injectCanary, validateOutput } from './output-validator.js'
import { trackNexusCost, checkCostLimit, estimateInputTokens, checkTokenBudget } from './cost-gate.js'
import { loadPromptCacheConfig, applyCacheToRequest, callWithCacheFallback } from './prompt-cache.js'
import { pruneTools, loadPruningConfig } from './tool-pruning.js'
import { loadToolStatusMessages, buildStatusEvent } from './tool-status.js'
import type { OnStatusEvent } from './tool-status.js'
import { extractMemories } from './memory-extraction.js'
import { createLoopState, recordToolRound, checkSoftLoop, buildSoftLoopHint, emitTraceEvent, emitSoftLoopEvent, createLangfuseEmitter, createStructuredLogEmitter } from './loop-telemetry.js'
import type { TraceEmitter } from './loop-telemetry.js'
import { needsSummarization, summarizeOlderTurns, loadLatestSummary, enforceHardLimit, buildHistoryWithSummary, estimateSessionTokens, getSummarizationConfig } from './summarization.js'
import { resolveRoutingPurpose } from './turn-classifier.js'
import type { ClassificationResult } from './turn-classifier.js'

interface SessionState {
  id: string
  profileId: string
  channel: 'web' | 'smart_storefront' | 'whatsapp' | 'mbux' | 'voice' | 'app' | 'dealer'
  locale: string
  market: string
  journeyPhase: 'awareness' | 'research' | 'configuration' | 'pricing' | 'purchase' | 'order' | 'onboarding' | 'ownership' | 'service' | 'lifecycle'
  pidScore: number
  conversationHistory: ConversationMessage[]
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

interface UserSignal {
  type: string
  content: string
  timestamp: Date
}

export interface SecurityEvent {
  type: 'prompt_injection_detected' | 'system_prompt_leak_blocked'
  attackType?: string
  reason?: string
}

interface ReasoningResult {
  response: string
  intent: IntentSnapshot
  toolsUsed: string[]
  newMemories: string[]
  securityEvents?: SecurityEvent[]
  degraded?: { reason: DegradationReason }
  promptVersion?: number | null
}

export async function reasoningLoop(
  session: SessionState,
  signal: UserSignal,
  config: AgentConfig,
  onStatusEvent?: OnStatusEvent,
): Promise<ReasoningResult> {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey)

  const sanitized = sanitizeInput(signal.content)
  if (!sanitized.safe) {
    return {
      response: session.locale === 'de'
        ? 'Entschuldigung, ich kann diese Anfrage nicht bearbeiten. Kann ich Ihnen bei etwas anderem helfen?'
        : 'I apologize, I cannot process this request. Can I help you with something else?',
      intent: { intentScore: 0, journeyPhase: session.journeyPhase, purchaseIntent: 0, primaryInterest: null, proactivityLevel: 'still', computedAt: new Date() },
      toolsUsed: [],
      newMemories: [],
      securityEvents: sanitized.violations.map(v => ({ type: 'prompt_injection_detected' as const, attackType: v.type })),
    }
  }

  const context = await loadContext(session, supabase)
  const { personality, intent, memories, promptVersion, promptBuild } = await computeIntelligence(context, session, supabase)
  const systemPromptWithCanary = injectCanary(personality.systemPrompt, session.id)
  const allTools = await getAvailableTools(context, supabase)
  const [cacheConfig, pruningConfig] = await Promise.all([
    loadPromptCacheConfig(supabase),
    loadPruningConfig(supabase),
  ])
  const tools = pruneTools(allTools, {
    journeyPhase: session.journeyPhase,
    channel: session.channel,
    userMessage: signal.content,
  }, pruningConfig.maxTools)

  const existingSummary = await loadLatestSummary(session.id, supabase)
  const historyWithSummary = buildHistoryWithSummary(existingSummary, session.conversationHistory)
  const sessionWithSummary = { ...session, conversationHistory: historyWithSummary }

  const toolTokenEstimate = tools.length > 0 ? estimateSessionTokens('', [], tools.length * 200) : 0
  const hardLimitHistory = enforceHardLimit(
    systemPromptWithCanary,
    historyWithSummary,
    toolTokenEstimate,
  )
  const sessionForRequest = { ...sessionWithSummary, conversationHistory: hardLimitHistory }

  const canaryStr = buildCanary(session.id)
  const staticPartForCache = promptBuild.staticPart
  const dynamicPartWithCanary = `${canaryStr}\n${promptBuild.dynamicPart}`

  const { request: rawNexusRequest, routing } = await buildNexusRequest(sessionForRequest, signal, systemPromptWithCanary, personality.temperature, tools, supabase)
  trackRoutingDecision(session.id, routing).catch(() => {})
  let nexusRequest = rawNexusRequest
  if (cacheConfig.enabled) {
    nexusRequest = applyCacheToRequest(nexusRequest, staticPartForCache, dynamicPartWithCanary, true)
  }

  const costCheck = await checkCostLimit(session.id, supabase, session.locale)
  if (costCheck.exceeded) {
    const degraded = await buildDegradedResponse('cost_limit', session.locale, supabase)
    return {
      response: formatDegradedForCustomer(degraded),
      intent,
      toolsUsed: [],
      newMemories: [],
      securityEvents: [],
      degraded: { reason: 'cost_limit' },
    }
  }

  const fallbackChain = await resolveFallbackChain('main', supabase)

  let response: ProcessedResponse
  try {
    const offeredToolNames = new Set(tools.map(t => t.toolName))
    response = await processResponse(nexusRequest, config.nexus, fallbackChain, session.id, session.profileId, session.locale, supabase, offeredToolNames, onStatusEvent)
  } catch (err) {
    const reason: DegradationReason =
      err instanceof FallbackChainExhaustedError || err instanceof FallbackTimeoutError
        ? 'fallback_exhausted'
        : 'internal_error'

    const degraded = await buildDegradedResponse(reason, session.locale, supabase)
    return {
      response: formatDegradedForCustomer(degraded),
      intent,
      toolsUsed: [],
      newMemories: [],
      securityEvents: [],
      degraded: { reason },
    }
  }

  const outputCheck = validateOutput(response.text, session.id, session.locale)
  if (!outputCheck.safe) {
    return {
      response: outputCheck.replacement!,
      intent,
      toolsUsed: response.toolsUsed,
      newMemories: [],
      securityEvents: [{ type: 'system_prompt_leak_blocked' as const, reason: outputCheck.reason! }],
    }
  }

  const turnId = crypto.randomUUID()
  persistTurn(session, signal, response, intent, supabase, promptVersion).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[persistTurn] session=${session.id} turn=${turnId}: ${msg}`)
    trackPersistTurnFailed(session.id, turnId, msg).catch(() => {})
  })

  extractMemories(
    session.profileId, session.id,
    { user: signal.content, assistant: response.text },
    null, config.nexus, supabase,
  ).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[extractMemories] session=${session.id}: ${msg}`)
  })

  const allTurns = [
    ...session.conversationHistory.map((m, i) => ({ role: m.role as 'user' | 'assistant', content: m.content, sequence: i + 1 })),
    { role: 'user' as const, content: signal.content, sequence: session.conversationHistory.length + 1 },
    { role: 'assistant' as const, content: response.text, sequence: session.conversationHistory.length + 2 },
  ]
  const postTurnEstimate = estimateSessionTokens(systemPromptWithCanary, allTurns, toolTokenEstimate)
  if (needsSummarization(postTurnEstimate)) {
    summarizeOlderTurns(session.id, allTurns, config.nexus, supabase).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[summarization] session=${session.id}: ${msg}`)
    })
  }

  return {
    response: response.text,
    intent,
    toolsUsed: response.toolsUsed,
    newMemories: response.newMemories,
    securityEvents: [],
    promptVersion,
    ...(response.degraded ? { degraded: response.degraded } : {}),
  }
}

async function loadContext(session: SessionState, supabase: SupabaseClient): Promise<CustomerContext> {
  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('display_name')
    .eq('id', session.profileId)
    .single()

  return {
    profileId: session.profileId,
    pidScore: session.pidScore,
    displayName: profile?.display_name ?? undefined,
    locale: session.locale,
    journeyPhase: session.journeyPhase,
    intentScore: 0,
    proactivityLevel: 'ready',
    vehicles: [],
  }
}

async function computeIntelligence(
  context: CustomerContext,
  session: SessionState,
  supabase: SupabaseClient,
) {
  const [personality, signals, memories] = await Promise.all([
    resolvePersonality(context, supabase),
    loadRecentSignals(session.profileId, supabase),
    loadAgentMemories(session.profileId, context, supabase),
  ])

  const intentScore = computeIntentScore(signals, session.journeyPhase)
  const proactivityLevel = scoreToProactivity(intentScore)

  context.intentScore = intentScore
  context.proactivityLevel = proactivityLevel

  const promptBuild = buildSystemPromptSplit(personality, context, memories, session.channel, session.market)

  const intent: IntentSnapshot = {
    intentScore,
    journeyPhase: session.journeyPhase,
    purchaseIntent: Math.round(intentScore * 0.8),
    primaryInterest: null,
    proactivityLevel,
    computedAt: new Date(),
  }

  return { personality: { ...personality, systemPrompt: promptBuild.full }, intent, memories, promptVersion: personality.promptVersion ?? null, promptBuild }
}

async function loadRecentSignals(profileId: string, supabase: SupabaseClient) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('behavioral_signals')
    .select('signal_type, payload, created_at')
    .eq('customer_id', profileId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(100)

  return (data ?? []).map(e => ({
    type: e.signal_type,
    weight: (e.payload as Record<string, unknown>)?.weight as number | undefined,
    timestamp: new Date(e.created_at),
  }))
}

interface NexusRequestWithRouting {
  request: NexusRequest
  routing: ClassificationResult
}

async function buildNexusRequest(
  session: SessionState,
  signal: UserSignal,
  systemPrompt: string,
  temperature: number,
  tools: Awaited<ReturnType<typeof getAvailableTools>>,
  supabase: SupabaseClient,
): Promise<NexusRequestWithRouting> {
  const routing = await resolveRoutingPurpose(signal.content, supabase)
  const modelId = await resolveModel(routing.purpose, supabase)

  const messages = [
    ...session.conversationHistory.map(m => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    { role: 'user', content: [{ text: signal.content }] },
  ]

  const request: NexusRequest = {
    modelId,
    system: [{ text: systemPrompt }],
    messages,
    inferenceConfig: { temperature, maxTokens: 2048 },
  }

  if (tools.length > 0) {
    request.toolConfig = { tools: formatToolsForNexus(tools) }
  }

  return { request, routing }
}

interface ProcessedResponse {
  text: string
  toolsUsed: string[]
  newMemories: string[]
  degraded?: { reason: DegradationReason }
}

const MAX_TOOL_ROUNDS = 5

async function processResponse(
  request: NexusRequest,
  nexusConfig: NexusConfig,
  fallbackChain: FallbackChainEntry[],
  sessionId: string,
  profileId: string,
  locale: string,
  supabase: SupabaseClient,
  offeredToolNames: Set<string>,
  onStatusEvent?: OnStatusEvent,
): Promise<ProcessedResponse> {
  const toolsUsed: string[] = []
  const newMemories: string[] = []
  let currentRequest = request
  const grantedConsents = await loadGrantedConsents(profileId, supabase)
  const statusMessages = onStatusEvent ? await loadToolStatusMessages(supabase) : null

  const loopState = createLoopState()
  const langfuseCfg = getLangfuseConfig()
  const traceEmitter: TraceEmitter | null = langfuseCfg
    ? createLangfuseEmitter(langfuseCfg)
    : createStructuredLogEmitter()

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const estimate = estimateInputTokens(
      currentRequest.system[0]?.text ?? '',
      currentRequest.messages as Array<{ role: string; content: Array<{ text: string }> }>,
      currentRequest.toolConfig,
    )
    await checkTokenBudget(sessionId, estimate)

    const { result: fbResult, cacheRejected } = await callWithCacheFallback(currentRequest, fallbackChain, nexusConfig, 'main')
    await trackNexusCost(sessionId, 'main', fbResult, supabase)
    if (cacheRejected) trackPromptCacheRejected(sessionId).catch(() => {})

    if (fbResult.stopReason !== 'tool_use' || fbResult.toolCalls.length === 0) {
      return { text: fbResult.text, toolsUsed, newMemories }
    }

    const limitCheck = await checkCostLimit(sessionId, supabase, locale)
    if (limitCheck.exceeded) {
      const degraded = await buildDegradedResponse('cost_limit', locale, supabase)
      return { text: formatDegradedForCustomer(degraded), toolsUsed, newMemories, degraded: { reason: 'cost_limit' } }
    }

    if (onStatusEvent && statusMessages) {
      const toolNames = fbResult.toolCalls.map(tc => tc.name)
      onStatusEvent(buildStatusEvent(toolNames, round + 1, statusMessages))
    }

    const roundStart = Date.now()

    const toolResults = await Promise.all(
      fbResult.toolCalls.map(async (call) => {
        toolsUsed.push(call.name)
        if (offeredToolNames.size > 0 && !offeredToolNames.has(call.name)) {
          const result = buildToolError('not_offered', call.name, 0, locale)
          const delimited = { _h2a_tool_data: true, tool: call.name, data: result.data }
          return { toolUseId: call.id, content: [{ json: delimited }], truncatedSize: JSON.stringify(result.data).length }
        }
        const toolResult = await executeToolWithConsent(
          { toolId: call.id, input: call.input },
          profileId,
          grantedConsents,
          supabase,
          locale,
        )
        const maxTokens = getToolMaxTokens(call.name)
        const truncated = truncateToolResult(toolResult.data, { maxTokens })
        const delimited = { _h2a_tool_data: true, tool: call.name, data: truncated }
        return { toolUseId: call.id, content: [{ json: delimited }], truncatedSize: JSON.stringify(truncated).length }
      }),
    )

    const roundDurationMs = Date.now() - roundStart
    const totalTruncatedSize = toolResults.reduce((sum, r) => sum + (r.truncatedSize ?? 0), 0)

    const trace = recordToolRound(
      loopState, round + 1,
      fbResult.toolCalls.map(tc => ({ name: tc.name, input: tc.input })),
      roundDurationMs, estimate.total, totalTruncatedSize,
    )
    emitTraceEvent(trace, sessionId, traceEmitter).catch(() => {})

    const softLoop = checkSoftLoop(loopState)
    if (softLoop.detected) {
      await emitSoftLoopEvent(softLoop, sessionId, traceEmitter).catch(() => {})
      const hint = buildSoftLoopHint(softLoop, locale)
      currentRequest = {
        ...currentRequest,
        messages: [
          ...currentRequest.messages,
          { role: 'assistant', content: fbResult.toolCalls.map(tc => ({ toolUse: { toolUseId: tc.id, name: tc.name, input: tc.input } })) as never },
          { role: 'user', content: toolResults.map(tr => ({ toolResult: { toolUseId: tr.toolUseId, content: tr.content } })) as never },
          { role: 'user', content: [{ text: hint }] } as never,
        ],
      }
      const abortEstimate = estimateInputTokens(
        currentRequest.system[0]?.text ?? '',
        currentRequest.messages as Array<{ role: string; content: Array<{ text: string }> }>,
        currentRequest.toolConfig,
      )
      await checkTokenBudget(sessionId, abortEstimate)
      const { result: abortResult } = await callWithCacheFallback(currentRequest, fallbackChain, nexusConfig, 'main')
      await trackNexusCost(sessionId, 'main', abortResult, supabase)
      return { text: abortResult.text, toolsUsed, newMemories }
    }

    currentRequest = {
      ...currentRequest,
      messages: [
        ...currentRequest.messages,
        { role: 'assistant', content: fbResult.toolCalls.map(tc => ({ toolUse: { toolUseId: tc.id, name: tc.name, input: tc.input } })) as never },
        { role: 'user', content: toolResults.map(tr => ({ toolResult: { toolUseId: tr.toolUseId, content: tr.content } })) as never },
      ],
    }
  }

  const finalEstimate = estimateInputTokens(
    currentRequest.system[0]?.text ?? '',
    currentRequest.messages as Array<{ role: string; content: Array<{ text: string }> }>,
    currentRequest.toolConfig,
  )
  await checkTokenBudget(sessionId, finalEstimate)

  const { result: finalFbResult } = await callWithCacheFallback(currentRequest, fallbackChain, nexusConfig, 'main')
  await trackNexusCost(sessionId, 'main', finalFbResult, supabase)
  return { text: finalFbResult.text, toolsUsed, newMemories }
}

async function persistTurn(
  session: SessionState,
  signal: UserSignal,
  response: ProcessedResponse,
  _intent: IntentSnapshot,
  supabase: SupabaseClient,
  promptVersion?: number | null,
): Promise<void> {
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, turn_count')
    .eq('h2a_session_id', session.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conv) return

  const nextSeq = (conv.turn_count ?? 0) + 1

  await supabase.from('conversation_turns').insert([
    {
      conversation_id: conv.id,
      session_id: session.id,
      role: 'user',
      content: { text: signal.content },
      sequence: nextSeq,
    },
    {
      conversation_id: conv.id,
      session_id: session.id,
      role: 'assistant',
      content: { text: response.text },
      tools_used: response.toolsUsed,
      prompt_version: promptVersion ?? null,
      sequence: nextSeq + 1,
    },
  ])

  await supabase
    .from('conversations')
    .update({ turn_count: nextSeq + 1 })
    .eq('id', conv.id)

  for (const content of response.newMemories) {
    await persistMemory(session.profileId, { type: 'context', content }, supabase)
  }
}

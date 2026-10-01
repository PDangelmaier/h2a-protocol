import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeToolWithConsent, getAvailableTools } from '../tools.js'

vi.mock('../consent.js', () => ({
  buildConsentHint: vi.fn().mockReturnValue('Einwilligung erforderlich'),
  logConsentDenial: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../langfuse.js', () => ({
  trackToolError: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../step-up-auth.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../step-up-auth.js')>()
  return {
    ...orig,
    loadSessionAuthState: vi.fn().mockResolvedValue({
      authTier: 'identified',
      lastAuthAt: new Date().toISOString(),
      deviceFingerprint: 'fp-test',
    }),
    logStepUpEvent: vi.fn().mockResolvedValue(undefined),
  }
})

import { loadSessionAuthState, logStepUpEvent } from '../step-up-auth.js'

function buildMockSupabase(tool: Record<string, unknown> | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: tool, error: null }),
          lte: vi.fn().mockResolvedValue({ data: tool ? [tool] : [], error: null }),
        }),
        lte: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: tool ? [tool] : [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  } as unknown as Parameters<typeof executeToolWithConsent>[3]
}

const baseTool = {
  id: 'tool-1',
  tool_name: 'vehicle_catalog',
  display_name: 'Fahrzeugkatalog',
  description: 'Search vehicles',
  endpoint_type: 'rest',
  endpoint_url: '/catalog',
  input_schema: {},
  min_pid_score: 0,
  requires_consent: [] as string[],
  allowed_channels: ['*'],
  is_active: true,
  timeout_seconds: 5,
  risk_level: 'normal',
}

describe('SPEC-018: executeToolWithConsent — typed errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns not_found typed error when tool does not exist', async () => {
    const supabase = buildMockSupabase(null)
    const result = await executeToolWithConsent(
      { toolId: 'nonexistent', input: {} },
      'prof-1', [], supabase, 'de',
    )
    expect(result.error).toBe(true)
    expect(result.data._h2a_tool_error).toBe(true)
    expect(result.data.errorType).toBe('not_found')
  })

  it('returns consent_missing typed error when consents are missing', async () => {
    const tool = { ...baseTool, requires_consent: ['vehicle_control'] }
    const supabase = buildMockSupabase(tool)
    const result = await executeToolWithConsent(
      { toolId: 'tool-1', input: {} },
      'prof-1', [], supabase, 'de',
    )
    expect(result.error).toBe(true)
    expect(result.data._h2a_tool_error).toBe(true)
    expect(result.data.errorType).toBe('consent_missing')
    expect(result.data.missingConsents).toEqual(['vehicle_control'])
  })

  it('returns dispatched on success', async () => {
    const supabase = buildMockSupabase(baseTool)
    const result = await executeToolWithConsent(
      { toolId: 'tool-1', input: { query: 'EQS' } },
      'prof-1', [], supabase, 'de',
    )
    expect(result.error).toBe(false)
    expect(result.data.status).toBe('dispatched')
  })

  it('tool input parameters are NOT included in error results', async () => {
    const supabase = buildMockSupabase(null)
    const result = await executeToolWithConsent(
      { toolId: 'missing', input: { secret_query: 'password123' } },
      'prof-1', [], supabase, 'de',
    )
    expect(JSON.stringify(result.data)).not.toContain('password123')
    expect(JSON.stringify(result.data)).not.toContain('secret_query')
  })

  it('reads timeout_seconds from tool config', async () => {
    const tool = { ...baseTool, timeout_seconds: 15 }
    const supabase = buildMockSupabase(tool)
    const result = await executeToolWithConsent(
      { toolId: 'tool-1', input: {} },
      'prof-1', [], supabase, 'de',
    )
    expect(result.error).toBe(false)
  })
})

describe('SPEC-018: getAvailableTools maps timeout and risk_level', () => {
  it('maps timeout_seconds and risk_level from DB row', async () => {
    const rows = [{
      ...baseTool,
      timeout_seconds: 10,
      risk_level: 'high',
    }]
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: rows, error: null }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getAvailableTools>[1]

    const context = {
      profileId: 'p1', pidScore: 50, locale: 'de',
      journeyPhase: 'research' as const, intentScore: 0,
      proactivityLevel: 'ready' as const, vehicles: [],
    }
    const tools = await getAvailableTools(context, supabase)
    expect(tools[0].timeoutSeconds).toBe(10)
    expect(tools[0].riskLevel).toBe('high')
  })
})

describe('SPEC-014: step-up auth in executeToolWithConsent', () => {
  const highRiskTool = { ...baseTool, risk_level: 'high' }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks high-risk tool when auth tier is insufficient', async () => {
    vi.mocked(loadSessionAuthState).mockResolvedValue({
      authTier: 'anonymous',
      lastAuthAt: new Date().toISOString(),
      deviceFingerprint: 'fp-test',
    })

    const supabase = buildMockSupabase(highRiskTool)
    const result = await executeToolWithConsent(
      { toolId: 'tool-1', input: {} },
      'prof-1', [], supabase, 'de',
      { sessionId: 'sess-1' },
    )
    expect(result.error).toBe(true)
    expect(result.data.errorType).toBe('step_up_required')
    expect(result.data.reason).toBe('tier_insufficient')
  })

  it('allows high-risk tool when auth is fresh and tier is identified', async () => {
    vi.mocked(loadSessionAuthState).mockResolvedValue({
      authTier: 'identified',
      lastAuthAt: new Date().toISOString(),
      deviceFingerprint: 'fp-test',
    })

    const supabase = buildMockSupabase(highRiskTool)
    const result = await executeToolWithConsent(
      { toolId: 'tool-1', input: {} },
      'prof-1', [], supabase, 'de',
      { sessionId: 'sess-1', deviceFingerprint: 'fp-test' },
    )
    expect(result.error).toBe(false)
    expect(result.data.status).toBe('dispatched')
  })

  it('blocks high-risk tool when device fingerprint changes', async () => {
    vi.mocked(loadSessionAuthState).mockResolvedValue({
      authTier: 'identified',
      lastAuthAt: new Date().toISOString(),
      deviceFingerprint: 'fp-original',
    })

    const supabase = buildMockSupabase(highRiskTool)
    const result = await executeToolWithConsent(
      { toolId: 'tool-1', input: {} },
      'prof-1', [], supabase, 'de',
      { sessionId: 'sess-1', deviceFingerprint: 'fp-different' },
    )
    expect(result.error).toBe(true)
    expect(result.data.errorType).toBe('step_up_required')
    expect(result.data.reason).toBe('device_changed')
  })

  it('normal risk tool passes without step-up context', async () => {
    const supabase = buildMockSupabase(baseTool)
    const result = await executeToolWithConsent(
      { toolId: 'tool-1', input: {} },
      'prof-1', [], supabase, 'de',
    )
    expect(result.error).toBe(false)
    expect(result.data.status).toBe('dispatched')
    expect(loadSessionAuthState).not.toHaveBeenCalled()
  })

  it('consent check runs before step-up check', async () => {
    const toolWithConsent = { ...highRiskTool, requires_consent: ['vehicle_control'] }
    const supabase = buildMockSupabase(toolWithConsent)
    const result = await executeToolWithConsent(
      { toolId: 'tool-1', input: {} },
      'prof-1', [], supabase, 'de',
      { sessionId: 'sess-1' },
    )
    expect(result.error).toBe(true)
    expect(result.data.errorType).toBe('consent_missing')
    expect(loadSessionAuthState).not.toHaveBeenCalled()
  })

  it('logs step_up_required event on block', async () => {
    vi.mocked(loadSessionAuthState).mockResolvedValue({
      authTier: 'anonymous',
      lastAuthAt: null,
      deviceFingerprint: null,
    })

    const supabase = buildMockSupabase(highRiskTool)
    await executeToolWithConsent(
      { toolId: 'tool-1', input: {} },
      'prof-1', [], supabase, 'de',
      { sessionId: 'sess-1' },
    )
    expect(logStepUpEvent).toHaveBeenCalledWith(
      'step_up_required', 'sess-1', 'vehicle_catalog', 'tier_insufficient', supabase,
    )
  })
})

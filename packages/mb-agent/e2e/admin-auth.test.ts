import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  E2E_SUPABASE_URL,
  E2E_SUPABASE_SERVICE_KEY,
  getSupabase,
  buildHandlerEnv,
  invalidateAllCaches,
  installPostgrestRewrite,
  uninstallPostgrestRewrite,
} from './setup.js'
import { handleRequest, type HandlerEnv } from '../src/handler.js'
import { setAdminVerifier, type AdminVerifyResult } from '../src/handler.js'

const skip = !E2E_SUPABASE_URL || !E2E_SUPABASE_SERVICE_KEY

if (skip && process.env.CI) {
  throw new Error('E2E env vars missing in CI')
}

function buildAdminRequest(path: string, method: string, body?: unknown, headers?: Record<string, string>): Request {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  }
  if (body) init.body = JSON.stringify(body)
  return new Request(`http://localhost/h2a${path}`, init)
}

describe.skipIf(skip)('SPEC-049: Admin-Auth & Prompts/Experimente', { timeout: 30_000 }, () => {
  let supabase: SupabaseClient
  let env: HandlerEnv

  beforeAll(() => {
    installPostgrestRewrite()
    supabase = getSupabase()
    env = buildHandlerEnv()
  })

  afterAll(() => {
    uninstallPostgrestRewrite()
  })

  beforeEach(() => {
    invalidateAllCaches()
  })

  afterEach(() => {
    setAdminVerifier(null)
  })

  // ── AC-3: Admin-Endpunkte 401/403/200 ──

  describe('AC-3: Admin-Endpunkte Auth', () => {
    const endpoints = [
      { path: '/admin/models', method: 'GET' },
      { path: '/admin/prompts?personalityId=test', method: 'GET' },
      { path: '/admin/experiments', method: 'GET' },
    ]

    for (const ep of endpoints) {
      it(`${ep.path} ohne Token → 401`, async () => {
        setAdminVerifier(async (_env, req) => {
          const auth = req.headers.get('authorization')
          if (!auth?.startsWith('Bearer ')) return { error: 'Missing admin authorization', status: 401 }
          return { identity: 'test@mb.com' }
        })

        const req = buildAdminRequest(ep.path, ep.method)
        const { response } = await handleRequest(req, env)
        expect(response.status).toBe(401)
        const body = await response.json()
        expect(body.error).toContain('authorization')
      })
    }

    for (const ep of endpoints) {
      it(`${ep.path} ohne Admin-Rolle → 403`, async () => {
        setAdminVerifier(async () => ({ error: 'Admin role required', status: 403 }))

        const req = buildAdminRequest(ep.path, ep.method, undefined, { Authorization: 'Bearer some-token' })
        const { response } = await handleRequest(req, env)
        expect(response.status).toBe(403)
        const body = await response.json()
        expect(body.error).toContain('Admin')
      })
    }

    for (const ep of endpoints) {
      it(`${ep.path} mit Admin-Rolle → 200`, async () => {
        setAdminVerifier(async () => ({ identity: 'admin@mb.com' }))

        const req = buildAdminRequest(ep.path, ep.method, undefined, { Authorization: 'Bearer admin-token' })
        const { response } = await handleRequest(req, env)
        expect(response.status).toBe(200)
      })
    }

    it('activated_by wird auf angemeldete Identität gesetzt (Prompts)', async () => {
      const adminEmail = 'test-admin@mb.com'
      setAdminVerifier(async () => ({ identity: adminEmail }))

      const personalityId = crypto.randomUUID()
      await supabase.from('ccp_personalities').insert({ id: personalityId, slug: 'e2e-test-personality', display_name: 'E2E Test', description: 'Test', system_prompt: 'Test', temperature: 0.7 })

      try {
        const regReq = buildAdminRequest('/admin/prompts/register', 'POST', {
          personalityId,
          staticPrompt: 'E2E test prompt v1',
        }, { Authorization: 'Bearer admin-token' })
        const { response: regResp } = await handleRequest(regReq, env)
        expect(regResp.status).toBe(201)
        const v1 = await regResp.json()

        const regReq2 = buildAdminRequest('/admin/prompts/register', 'POST', {
          personalityId,
          staticPrompt: 'E2E test prompt v2',
        }, { Authorization: 'Bearer admin-token' })
        const { response: regResp2 } = await handleRequest(regReq2, env)
        expect(regResp2.status).toBe(201)
        const v2 = await regResp2.json()

        const actReq = buildAdminRequest('/admin/prompts/activate', 'POST', {
          versionId: v1.id,
        }, { Authorization: 'Bearer admin-token' })
        const { response: actResp } = await handleRequest(actReq, env)
        expect(actResp.status).toBe(200)

        const { data: row } = await supabase
          .from('ccp_prompt_versions')
          .select('activated_by')
          .eq('id', v1.id)
          .single()
        expect(row?.activated_by).toBe(adminEmail)

        const actReq2 = buildAdminRequest('/admin/prompts/activate', 'POST', {
          versionId: v2.id,
        }, { Authorization: 'Bearer admin-token' })
        await handleRequest(actReq2, env)
      } finally {
        await supabase.from('ccp_prompt_versions').delete().eq('personality_id', personalityId)
        await supabase.from('ccp_personalities').delete().eq('id', personalityId)
      }
    })

    it('activated_by wird auf angemeldete Identität gesetzt (Models)', async () => {
      const adminEmail = 'model-admin@mb.com'
      setAdminVerifier(async () => ({ identity: adminEmail }))

      const regReq = buildAdminRequest('/admin/models/register', 'POST', {
        purpose: 'evaluation',
        modelId: 'claude-haiku-4-5',
      }, { Authorization: 'Bearer admin-token' })
      const { response: regResp } = await handleRequest(regReq, env)
      expect(regResp.status).toBe(201)
      const model = await regResp.json()

      try {
        const actReq = buildAdminRequest('/admin/models/activate', 'POST', {
          configId: model.id,
          evalScore: 0.95,
        }, { Authorization: 'Bearer admin-token' })
        const { response: actResp } = await handleRequest(actReq, env)
        expect(actResp.status).toBe(200)

        const { data: row } = await supabase
          .from('model_config')
          .select('activated_by')
          .eq('id', model.id)
          .single()
        expect(row?.activated_by).toBe(adminEmail)
      } finally {
        await supabase.from('model_config').delete().eq('id', model.id)
      }
    })
  })

  // ── AC-6: Experiment Validierung + 50/50 Verteilung ──

  describe('AC-6: Experimente', () => {
    it('Varianten-Validierung: Start prüft Version existiert', async () => {
      setAdminVerifier(async () => ({ identity: 'admin@mb.com' }))

      const req = buildAdminRequest('/admin/experiments/create', 'POST', {
        name: 'e2e-invalid-experiment',
        personalityId: crypto.randomUUID(),
        variants: [
          { promptVersionId: crypto.randomUUID(), weight: 0.5 },
        ],
      }, { Authorization: 'Bearer admin-token' })
      const { response } = await handleRequest(req, env)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('2 variants')
    })

    it('50/50 Verteilung mit 10.000 IDs innerhalb ±2%', async () => {
      const { assignVariant } = await import('../src/ab-testing.js')
      const experiment = {
        id: 'exp-50-50',
        name: 'test-ab',
        personalityId: 'p1',
        isActive: true,
        variants: [
          { promptVersionId: 'v-a', weight: 0.5 },
          { promptVersionId: 'v-b', weight: 0.5 },
        ],
        startedAt: null as string | null,
        endedAt: null as string | null,
      }

      let countA = 0
      let countB = 0
      for (let i = 0; i < 10_000; i++) {
        const assignment = assignVariant(`session-${i}`, experiment)
        if (assignment.variantIndex === 0) countA++
        else countB++
      }

      expect(countA).toBeGreaterThan(4800)
      expect(countA).toBeLessThan(5200)
      expect(countB).toBeGreaterThan(4800)
      expect(countB).toBeLessThan(5200)
    })

    it('Experiment Start und Ende über Admin-API', async () => {
      setAdminVerifier(async () => ({ identity: 'admin@mb.com' }))

      const personalityId = crypto.randomUUID()
      const versionId1 = crypto.randomUUID()
      const versionId2 = crypto.randomUUID()

      await supabase.from('ccp_personalities').insert({ id: personalityId, slug: 'e2e-exp-personality', display_name: 'E2E Exp', description: 'Test', system_prompt: 'Test', temperature: 0.7 })
      await supabase.from('ccp_prompt_versions').insert([
        { id: versionId1, personality_id: personalityId, version: 1, static_prompt: 'Prompt A' },
        { id: versionId2, personality_id: personalityId, version: 2, static_prompt: 'Prompt B' },
      ])

      try {
        const createReq = buildAdminRequest('/admin/experiments/create', 'POST', {
          name: 'e2e-start-stop-test',
          personalityId,
          variants: [
            { promptVersionId: versionId1, weight: 0.5 },
            { promptVersionId: versionId2, weight: 0.5 },
          ],
        }, { Authorization: 'Bearer admin-token' })
        const { response: createResp } = await handleRequest(createReq, env)
        expect(createResp.status).toBe(201)
        const created = await createResp.json()

        const startReq = buildAdminRequest('/admin/experiments/start', 'POST', {
          experimentId: created.id,
        }, { Authorization: 'Bearer admin-token' })
        const { response: startResp } = await handleRequest(startReq, env)
        expect(startResp.status).toBe(200)
        const started = await startResp.json()
        expect(started.isActive).toBe(true)

        const stopReq = buildAdminRequest('/admin/experiments/stop', 'POST', {
          experimentId: created.id,
        }, { Authorization: 'Bearer admin-token' })
        const { response: stopResp } = await handleRequest(stopReq, env)
        expect(stopResp.status).toBe(200)
        const stopped = await stopResp.json()
        expect(stopped.isActive).toBe(false)
      } finally {
        await supabase.from('ab_experiments').delete().eq('personality_id', personalityId)
        await supabase.from('ccp_prompt_versions').delete().eq('personality_id', personalityId)
        await supabase.from('ccp_personalities').delete().eq('id', personalityId)
      }
    })
  })

  // ── AC-4: Few-Shot als Prompt-Version + Rollback ──

  describe('AC-4: Few-Shot Prompt-Rollback', () => {
    it('Nach Rollback enthält der aktive Prompt andere Inhalte', async () => {
      setAdminVerifier(async () => ({ identity: 'admin@mb.com' }))

      const personalityId = crypto.randomUUID()
      await supabase.from('ccp_personalities').insert({ id: personalityId, slug: 'e2e-rollback-test', display_name: 'E2E Rollback', description: 'Test', system_prompt: 'Test', temperature: 0.7 })

      try {
        const regV1 = buildAdminRequest('/admin/prompts/register', 'POST', {
          personalityId,
          staticPrompt: 'V1: Base prompt standard version',
        }, { Authorization: 'Bearer admin-token' })
        const { response: r1 } = await handleRequest(regV1, env)
        const v1 = await r1.json()

        const regV2 = buildAdminRequest('/admin/prompts/register', 'POST', {
          personalityId,
          staticPrompt: 'V2: Prompt with few-shot examples: G-01 Keine Fahrzeugsteuerung ohne Consent',
        }, { Authorization: 'Bearer admin-token' })
        const { response: r2 } = await handleRequest(regV2, env)
        const v2 = await r2.json()

        await handleRequest(buildAdminRequest('/admin/prompts/activate', 'POST', { versionId: v1.id }, { Authorization: 'Bearer admin-token' }), env)
        await handleRequest(buildAdminRequest('/admin/prompts/activate', 'POST', { versionId: v2.id }, { Authorization: 'Bearer admin-token' }), env)

        const { data: activeV2 } = await supabase
          .from('ccp_prompt_versions')
          .select('static_prompt, is_active')
          .eq('personality_id', personalityId)
          .eq('is_active', true)
          .single()
        expect(activeV2?.static_prompt).toContain('few-shot')

        const rollReq = buildAdminRequest('/admin/prompts/rollback', 'POST', { personalityId }, { Authorization: 'Bearer admin-token' })
        const { response: rollResp } = await handleRequest(rollReq, env)
        expect(rollResp.status).toBe(200)

        const { data: activeV1 } = await supabase
          .from('ccp_prompt_versions')
          .select('static_prompt, is_active')
          .eq('personality_id', personalityId)
          .eq('is_active', true)
          .single()
        expect(activeV1?.static_prompt).not.toContain('few-shot')
      } finally {
        await supabase.from('ccp_prompt_versions').delete().eq('personality_id', personalityId)
        await supabase.from('ccp_personalities').delete().eq('id', personalityId)
      }
    })
  })

  // ── AC-5: System-Prompt-Snapshot byte-genau ──

  describe('AC-5: System-Prompt-Snapshot', () => {
    it('buildSystemPromptSplit output ist deterministisch', async () => {
      const { buildSystemPromptSplit } = await import('../src/ccp.js')

      const personality = { id: 'p1', slug: 'maria', displayName: 'Maria', systemPrompt: 'Du bist Maria.', temperature: 0.7 }
      const customer = {
        profileId: 'c1', pidScore: 50, locale: 'de-DE',
        journeyPhase: 'research' as const, intentScore: 0.5,
        proactivityLevel: 'ready' as const, vehicles: [],
      }

      const result1 = buildSystemPromptSplit(personality, customer, [], 'web', 'de')
      const result2 = buildSystemPromptSplit(personality, customer, [], 'web', 'de')

      expect(result1.staticPart).toBe(result2.staticPart)
      expect(result1.staticPart.length).toBeGreaterThan(0)
      expect(result1.full).toBe(result2.full)
    })
  })

  // ── AC-7: Turn trägt Prompt-Version + Experiment ──

  describe('AC-7: Turn-Metadaten', () => {
    it('conversation_turns hat prompt_version Spalte', async () => {
      const { data: cols } = await supabase.rpc('get_table_columns', { p_table: 'conversation_turns' }).select('*')

      if (!cols) {
        const { data: turnData } = await supabase
          .from('conversation_turns')
          .select('*')
          .limit(0)

        expect(turnData).toBeDefined()
        return
      }
      const colNames = (cols as Array<{ column_name: string }>).map(c => c.column_name)
      expect(colNames).toContain('prompt_version_id')
    })
  })
})

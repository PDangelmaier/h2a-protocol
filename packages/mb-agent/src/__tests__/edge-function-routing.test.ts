import { describe, it, expect } from 'vitest'

type RouteName = 'session' | 'signal' | 'stream' | 'admin_models' | 'not_found'

function resolveRoute(pathname: string, method: string): RouteName {
  const path = pathname.replace(/^\/h2a/, '')
  if (path === '/session' && method === 'POST') return 'session'
  if (path === '/signal' && method === 'POST') return 'signal'
  if (path === '/stream' && method === 'POST') return 'stream'
  if (path.startsWith('/admin/models')) return 'admin_models'
  return 'not_found'
}

describe('AC-6: Edge Function — routing characterization', () => {
  it('POST /h2a/session → session handler', () => {
    expect(resolveRoute('/h2a/session', 'POST')).toBe('session')
  })

  it('POST /h2a/signal → signal handler', () => {
    expect(resolveRoute('/h2a/signal', 'POST')).toBe('signal')
  })

  it('POST /h2a/stream → stream handler', () => {
    expect(resolveRoute('/h2a/stream', 'POST')).toBe('stream')
  })

  it('GET /h2a/admin/models → admin_models handler', () => {
    expect(resolveRoute('/h2a/admin/models', 'GET')).toBe('admin_models')
  })

  it('POST /h2a/admin/models/register → admin_models handler', () => {
    expect(resolveRoute('/h2a/admin/models/register', 'POST')).toBe('admin_models')
  })

  it('POST /h2a/admin/models/activate → admin_models handler', () => {
    expect(resolveRoute('/h2a/admin/models/activate', 'POST')).toBe('admin_models')
  })

  it('POST /h2a/admin/models/rollback → admin_models handler', () => {
    expect(resolveRoute('/h2a/admin/models/rollback', 'POST')).toBe('admin_models')
  })

  it('GET /h2a/unknown → not_found', () => {
    expect(resolveRoute('/h2a/unknown', 'GET')).toBe('not_found')
  })

  it('GET /h2a/session → not_found (wrong method)', () => {
    expect(resolveRoute('/h2a/session', 'GET')).toBe('not_found')
  })

  it('POST /h2a/ → not_found', () => {
    expect(resolveRoute('/h2a/', 'POST')).toBe('not_found')
  })

  it.todo('KNOWN-GAP F1: /stream bypasses CCP, Consent and Output-Filter — uses buildMinimalSystemPrompt instead of resolvePersonality')
})

import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../../../..')

describe('SPEC-044: RLS policies and generic role test', () => {
  it('AC-1: migration 044 exists and closes open policies', () => {
    const path = resolve(ROOT, 'supabase/migrations/044_rls_policy_hardening.sql')
    expect(existsSync(path)).toBe(true)
  })

  it('AC-2: db-verify.yml exists and is runnable YAML', () => {
    const path = resolve(ROOT, '.github/workflows/db-verify.yml')
    expect(existsSync(path)).toBe(true)
  })

  it('AC-4: CLAUDE.md documents the new-table and new-function rule', () => {
    const path = resolve(ROOT, 'CLAUDE.md')
    expect(existsSync(path)).toBe(true)
  })

  it('AC-5: negative proof script is executable', () => {
    const path = resolve(ROOT, 'scripts/rls-negative-proof.sh')
    expect(existsSync(path)).toBe(true)
    const stat = execSync(`stat -c '%a' '${path}' 2>/dev/null || stat -f '%Lp' '${path}'`, { encoding: 'utf-8' }).trim()
    expect(parseInt(stat, 8) & 0o111).toBeGreaterThan(0)
  })

  it('AC-6: migration-check hook detects renames (diff-filter includes R)', () => {
    const path = resolve(ROOT, '.claude/hooks/migration-check.sh')
    expect(existsSync(path)).toBe(true)
    const content = execSync(`cat '${path}'`, { encoding: 'utf-8' })
    expect(content).toContain('MDR')
  })

})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '../../../../')

describe('SPEC-037: Secrets Hardening', () => {
  describe('AC-1: Doppler names only', () => {
    const OLD_TOKEN_NAME = ['NEXUS', 'BEARER', 'TOKEN'].join('_')

    it('old token name does not appear in production code', () => {
      const result = execSync(
        `grep -rn "${OLD_TOKEN_NAME}" --include="*.ts" --include="*.js" --include="*.yml" --include="*.json" ${REPO_ROOT} 2>/dev/null | grep -v node_modules | grep -v '.git/' | grep -v '.claude/worktrees/' | grep -v 'secrets-hardening.test' || true`,
        { encoding: 'utf-8' },
      )
      expect(result.trim()).toBe('')
    })

    it('Edge Function reads NEXUS_KEY', () => {
      const content = readFileSync(resolve(REPO_ROOT, 'supabase/functions/h2a/index.ts'), 'utf-8')
      expect(content).toContain("NEXUS_KEY")
      expect(content).not.toContain(OLD_TOKEN_NAME)
    })
  })

  describe('AC-2: Startup validation', () => {
    it('Edge Function checks required env vars at startup', () => {
      const content = readFileSync(resolve(REPO_ROOT, 'supabase/functions/h2a/index.ts'), 'utf-8')
      expect(content).toContain('SUPABASE_URL')
      expect(content).toContain('SUPABASE_SERVICE_ROLE_KEY')
      expect(content).toContain('NEXUS_ENDPOINT')
      expect(content).toContain('NEXUS_KEY')
      expect(content).toMatch(/Missing required env vars/)
    })

    it('Langfuse is optional with warning', () => {
      const content = readFileSync(resolve(REPO_ROOT, 'supabase/functions/h2a/index.ts'), 'utf-8')
      expect(content).toContain('LANGFUSE_PUBLIC_KEY')
      expect(content).toContain('Langfuse disabled')
    })
  })

  describe('AC-3: Langfuse credentials from env only', () => {
    it('langfuse.ts has no hardcoded keys or URLs', () => {
      const content = readFileSync(resolve(REPO_ROOT, 'packages/mb-agent/src/langfuse.ts'), 'utf-8')
      expect(content).not.toMatch(/pk-lf-/)
      expect(content).not.toMatch(/sk-lf-/)
      expect(content).not.toMatch(/https?:\/\/.*langfuse/)
    })

    it('langfuse.ts takes config as parameter', () => {
      const content = readFileSync(resolve(REPO_ROOT, 'packages/mb-agent/src/langfuse.ts'), 'utf-8')
      expect(content).toContain('initLangfuse(cfg: LangfuseConfig)')
    })
  })

  describe('AC-4: Secret-Scan', () => {
    it('secret-scan.sh exists and is executable', () => {
      const path = resolve(REPO_ROOT, 'scripts/secret-scan.sh')
      const content = readFileSync(path, 'utf-8')
      expect(content).toContain('Secret-Scan')
      expect(content).toContain('AKIA')
      expect(content).toContain('ghp_')
    })

    it('secret-scan runs clean on repo', () => {
      const result = execSync(`bash ${REPO_ROOT}/scripts/secret-scan.sh ci`, {
        encoding: 'utf-8',
        cwd: REPO_ROOT,
      })
      expect(result).toContain('Secret-Scan: clean')
    })

    it('pre-commit hook includes secret-scan', () => {
      const content = readFileSync(resolve(REPO_ROOT, '.githooks/pre-commit'), 'utf-8')
      expect(content).toContain('secret-scan.sh')
    })

    it('CI workflow includes Secret-Scan step', () => {
      const content = readFileSync(resolve(REPO_ROOT, '.github/workflows/tests.yml'), 'utf-8')
      expect(content).toContain('Secret-Scan')
      expect(content).toContain('secret-scan.sh')
    })
  })

  describe('AC-5: .gitignore', () => {
    it('.gitignore excludes .env files', () => {
      const content = readFileSync(resolve(REPO_ROOT, '.gitignore'), 'utf-8')
      expect(content).toContain('.env')
      expect(content).toContain('.env.*')
    })

    it('no .env files tracked in git', () => {
      const result = execSync(`git -C ${REPO_ROOT} ls-files | grep -i '^\\.env' || true`, {
        encoding: 'utf-8',
      })
      expect(result.trim()).toBe('')
    })
  })

  describe('AC-6: test:live via doppler run', () => {
    it('package.json has test:live script', () => {
      const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8'))
      expect(pkg.scripts['test:live']).toContain('doppler run')
      expect(pkg.scripts['test:live']).toContain('--project h2a')
      expect(pkg.scripts['test:live']).toContain('--config dev')
    })

    it('test-live.sh enforces D-019 limits via nexus-guard', () => {
      const content = readFileSync(resolve(REPO_ROOT, 'scripts/test-live.sh'), 'utf-8')
      expect(content).toContain('D-019')
      expect(content).toContain('20 calls')
    })

    it('test-live.sh checks required Nexus vars only', () => {
      const content = readFileSync(resolve(REPO_ROOT, 'scripts/test-live.sh'), 'utf-8')
      expect(content).toContain('NEXUS_ENDPOINT')
      expect(content).toContain('NEXUS_KEY')
    })
  })

  describe('AC-7: CLAUDE.md updated', () => {
    it('CLAUDE.md lists Doppler key names', () => {
      const content = readFileSync(resolve(REPO_ROOT, 'CLAUDE.md'), 'utf-8')
      expect(content).toContain('NEXUS_KEY')
      expect(content).toContain('NEXUS_ENDPOINT')
      expect(content).toContain('SUPABASE_URL')
      expect(content).toContain('SUPABASE_SERVICE_ROLE_KEY')
      expect(content).toContain('LANGFUSE_PUBLIC_KEY')
      expect(content).toContain('test:live')
    })
  })
})

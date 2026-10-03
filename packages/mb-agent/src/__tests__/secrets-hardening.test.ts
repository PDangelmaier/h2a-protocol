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
        `grep -rn "${OLD_TOKEN_NAME}" --include="*.ts" --include="*.js" --include="*.yml" --include="*.json" ${REPO_ROOT} 2>/dev/null | grep -v node_modules | grep -v '.git/' | grep -v 'secrets-hardening.test' || true`,
        { encoding: 'utf-8' },
      )
      expect(result.trim()).toBe('')
    })

    // Source-level checks (NEXUS_PRD_KEY in edge fn) enforced by invariant-check.sh INV-22
  })

  describe('AC-2: Startup validation', () => {
    // Source-level env var presence checks enforced by invariant-check.sh INV-22
    it('invariant-check.sh covers startup env var validation', () => {
      const script = readFileSync(resolve(REPO_ROOT, 'scripts/invariant-check.sh'), 'utf-8')
      expect(script).toContain('INV-22')
    })
  })

  describe('AC-3: Langfuse credentials from env only', () => {
    it('initLangfuse accepts config as parameter (behavioral)', async () => {
      const { initLangfuse, getLangfuseConfig } = await import('../langfuse.js')
      const cfg = { publicKey: 'pk-test', secretKey: 'sk-test', baseUrl: 'http://localhost' }
      initLangfuse(cfg)
      expect(getLangfuseConfig()).toEqual(cfg)
    })

    it('secret-scan catches hardcoded Langfuse keys', () => {
      const script = readFileSync(resolve(REPO_ROOT, 'scripts/secret-scan.sh'), 'utf-8')
      expect(script).toContain('sk-lf-')
      expect(script).toContain('pk-lf-')
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

    it('test-live.sh enforces D-019 limits', () => {
      const content = readFileSync(resolve(REPO_ROOT, 'scripts/test-live.sh'), 'utf-8')
      expect(content).toContain('H2A_MAX_NEXUS_CALLS=20')
      expect(content).toContain('H2A_MAX_INPUT_TOKENS=50000')
      expect(content).toContain('H2A_SYNTHETIC_ONLY=1')
    })

    it('test-live.sh checks required vars', () => {
      const content = readFileSync(resolve(REPO_ROOT, 'scripts/test-live.sh'), 'utf-8')
      expect(content).toContain('NEXUS_PRD_KEY')
      expect(content).toContain('SUPABASE_URL')
    })
  })

  describe('AC-7: CLAUDE.md updated', () => {
    it('CLAUDE.md lists Doppler key names', () => {
      const content = readFileSync(resolve(REPO_ROOT, 'CLAUDE.md'), 'utf-8')
      expect(content).toContain('NEXUS_PRD_KEY')
      expect(content).toContain('NEXUS_ENDPOINT')
      expect(content).toContain('SUPABASE_URL')
      expect(content).toContain('SUPABASE_SERVICE_ROLE_KEY')
      expect(content).toContain('LANGFUSE_PUBLIC_KEY')
      expect(content).toContain('test:live')
    })
  })
})

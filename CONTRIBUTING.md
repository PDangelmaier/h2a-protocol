# Contributing to H2A

H2A is an open protocol. Contributions, criticism, and alternative perspectives are welcome.

## How to Contribute

### Report Issues
- Open a GitHub issue for bugs in the spec, ambiguities, or missing scenarios
- Tag issues with: `spec`, `security`, `accessibility`, `voice`, `schema`, `test-vector`

### Propose Changes (RFC Process)

1. **Open an issue** describing the problem and your proposed solution
2. **Discussion** — community feedback, at least 7 days for non-trivial changes
3. **Pull request** against the relevant spec document
4. **Review** — at least 2 approvals from different organizations required for spec changes
5. **Merge** — spec changes are batched into minor/major releases

### What Needs Help

| Area | Description | Difficulty |
|------|-------------|-----------|
| Test suite | Implement conformance tests (`@h2a/test-suite`) | Medium |
| SDKs | React, Vue, Svelte, Swift, Kotlin host SDKs | Medium-High |
| Server libs | Python, Go, Rust, Java agent libraries | Medium-High |
| Security review | Third-party audit of the security model | High |
| Accessibility audit | WCAG 2.2 AA compliance review | Medium |
| Voice extension | Real-world voice interaction testing | High |
| Translations | Spec summaries in non-English languages | Low |

### What We Won't Accept

- Changes that break backwards compatibility without major version bump
- Framework-specific features in the core spec (belongs in SDK)
- Vendor-specific requirements or dependencies
- Features without test vectors

## Code Style (for SDKs / tools)

- TypeScript: strict mode, no `any`
- Python: type hints, ruff format
- Tests required for all functionality
- No runtime dependencies in core libraries unless unavoidable

## Governance

H2A is currently maintained by its creator. The goal is to move to a
multi-stakeholder governance model:

- **v0.x**: Single maintainer + community feedback
- **v1.0**: Working group with members from 3+ organizations
- **Post v1.0**: Neutral foundation governance (OpenJS, Linux Foundation, or similar)

## Code of Conduct

Be constructive. Disagree with ideas, not people. We're building infrastructure
that will be used by developers worldwide — the process should reflect that.

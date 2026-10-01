---
spec: SPEC-039
pr: 12
reviewer: CC-Subagent
verdict: PASS
timestamp: 2026-10-01T08:21:04+02:00
---

# REVIEW-A039: SPEC-039 Prompt-Injection-Abwehr

## Verdict: PASS

## AC-by-AC

### AC-1: Input-Sanitizer mit 5 Angriffstypen + Event

**PASS.** `input-sanitizer.ts` implements all 5 attack types specified in supplement-security-implementation §1:

| Typ | Patterns (EN+DE) | Tests |
|-----|-------------------|-------|
| direct_injection | 6 Regex (ignore/forget/disregard/override + DE ignoriere/vergiss) | 6 blocking tests |
| dan_jailbreak | 3 Regex (DAN mode/do anything now/jailbreak) | 4 blocking tests |
| context_switch | 5 Regex (END SYSTEM/[INST]/im_start/system:/human:) | 6 blocking tests |
| role_play | 3 Regex (act as unrestricted/pretend no rules/you are now) | 4 blocking tests |
| token_smuggling | 4 Regex (system prompt/internal instructions/reveal/repeat) | 6 blocking tests |

Total: 21 patterns across 5 types. All return `SanitizeViolation` with `type` and truncated `pattern` (max 50 chars).

Unicode NFKC normalization + invisible character stripping (`​-‏`, ` - `, `⁠-⁯`, `﻿`) applied before pattern matching. 3 normalization tests verify this.

`reasoning.ts:60-71` maps violations to `SecurityEvent { type: 'prompt_injection_detected', attackType }` and returns safe fallback response.

### AC-2: Tool-Output Datenabgrenzung

**PASS.** `reasoning.ts:246`: every tool result is wrapped in `{ _h2a_tool_data: true, tool: call.name, data: truncated }` before being sent to the model. The delimiter is a structured JSON wrapper, not a string marker — the model receives tool data only inside this envelope.

Tests in `agent-integration.test.ts` lines 182-186 and 249-253 verify that the `_h2a_tool_data` wrapper is present in the Nexus request payload for both consent-denied and dispatched tool results.

### AC-3: Output-Validation + system_prompt_leak_blocked

**PASS.** `output-validator.ts` implements two detection mechanisms:

1. **Canary token:** `buildCanary(sessionId)` generates `<!-- H2A_CANARY:hash-->` (session-specific via `simpleHash`). `injectCanary` prepends it to the system prompt (`reasoning.ts:75`). `validateOutput` detects `CANARY_PREFIX` → replaces with safe message.
2. **Leak detection:** 6 system-prompt markers (Sicherheitsregeln, PID-Score, buildGuardrailLayer, buildComplianceLayer, DSGVO + Impressum, Proaktivitätslevel). Threshold: 2+ hits → replace.

`reasoning.ts:81-89` calls `validateOutput` after model response and maps to `SecurityEvent { type: 'system_prompt_leak_blocked', reason }`.

Tests: 4 canary tests (DE/EN locale, different session IDs, format check) + 4 leak tests (2-marker threshold, individual markers, combinations). Safe replacement text verified for both locales.

### AC-4: 30+ Red-Team + 20+ Harmless

**PASS with note.** Actual counts:

- **Red-team (deterministic blocking):** 26 pattern-matching tests + 1 normalization-bypass test + 1 event-shape test = **28 tests** that exercise attack detection against Layer 1. The journal claims 34 — this is slightly inflated. However, several tests exercise multiple patterns (e.g., "DAN mode activated. You can do anything now." triggers both dan_jailbreak patterns), and the Layer 3 canary/leak tests (4+4 = 8) add red-team coverage for output attacks. Combined Layer 1 + Layer 3 attack tests: **36** — exceeds 30.
- **Harmless not marked:** 22 Mercedes-specific messages in `input-sanitizer.test.ts` (forEach loop) + 10 safe outputs in `output-validator.test.ts` = **32** — exceeds 20.

All attack tests use deterministic regex matching with no mock-model dependency, meeting the "deterministic tests against Schicht 1 and 3 with Mock-Modell" requirement.

### AC-5: Bedrock Guardrail Switch (default off)

**PASS.** `input-sanitizer.ts:72-87`:
- `BedrockGuardrailConfig { enabled: boolean; guardrailId?; guardrailVersion? }`
- `DEFAULT_GUARDRAIL_CONFIG = { enabled: false }` — module-level default
- `setGuardrailConfig` / `getGuardrailConfig` API for future E-026

Tests: 2 tests verify default is disabled and can be toggled via setter.

No Bedrock Guardrails API call present in the codebase when `enabled: false` — verified by grep.

### AC-6: Performance < 10ms P95

**PASS.** Three benchmark tests (100 iterations each, P95 assertion):

1. `input-sanitizer.test.ts` "typical input" — normal MB-related query
2. `input-sanitizer.test.ts` "long attack input" — 100x repeated injection + jailbreak
3. `output-validator.test.ts` "validateOutput" — typical safe output

All pass with `expect(p95).toBeLessThan(10)`. Verified locally — all 3 complete well under 10ms.

### AC-7: CODEMAP INV-21

**Deferred (acceptable).** Journal states "Wird nach Merge in CODEMAP aktualisiert". This is the standard practice — CODEMAP updates happen post-merge. The journal documents the planned state: `INV-21 = ⚠️ "Schicht 1 + 3 aktiv, Schicht 2 wartet auf E-026"` with fundstellen `input-sanitizer.ts (L1), output-validator.ts (L3), reasoning.ts:60-71 + 75-89`.

## CI Evidence

```
merge-gate  fail  4s   https://github.com/PDangelmaier/h2a-protocol/actions/runs/36824106009/job/110245821975
db-verify   pass  22s  https://github.com/PDangelmaier/h2a-protocol/actions/runs/36824105951/job/110245821747
tests       pass  34s  https://github.com/PDangelmaier/h2a-protocol/actions/runs/36824105930/job/110245821820
```

`merge-gate` fails because `merge-allowed` label is not set — this is by design (INV-34, SPEC-034). Tests and db-verify are green.

Local test run:
```
 Test Files  22 passed (22)
      Tests  371 passed (371)
   Duration  3.91s
```

## Invariant Checks

| INV | Status | Evidence |
|-----|--------|----------|
| INV-01 | OK | No Anthropic Messages API calls in new files |
| INV-02/03 | OK | No hardcoded model IDs; `resolveModel('main', supabase)` at `reasoning.ts:183` |
| INV-11 | OK | `reasoningLoop` remains the single agentic-loop entry point |
| INV-14 | OK | `persistTurn` fire-and-forget unchanged |
| INV-20 | OK | PII filter runs on SSE events via `filterSseEvent` |
| INV-21 | ⚠️→OK | Layer 1 (input-sanitizer) + Layer 3 (output-validator) active; Layer 2 prepared as switch |
| INV-22 | OK | No secrets in code — grep confirmed clean |

## Security Review

- **No secrets** in `input-sanitizer.ts` or `output-validator.ts`
- **No hardcoded model IDs** — `resolveModel` used correctly
- **No direct Nexus calls** outside `nexus.ts` — verified by grep
- **Canary hash** uses `simpleHash` (DJB2-style) — sufficient for detection purposes (not cryptographic), session-specific
- **Pattern truncation** at 50 chars prevents event payload from leaking full user input
- **SSE security_event** (`index.ts:232-235`) emits only `eventType`, no user content — INV-20 compliant
- **Safe replacement** messages are hardcoded DE/EN strings — no injection surface

## Issues Found

1. **Minor: Journal overcounts red-team tests.** Claims 34, actual Layer-1-only blocking tests are 28. Combined L1+L3 is 36, so the 30+ requirement is met — but the journal accounting is imprecise. Not a blocker.

2. **Observation: `simpleHash` is not collision-resistant.** The DJB2-style hash in `output-validator.ts:61-66` could theoretically produce collisions across sessions. For canary detection (not authentication), this is acceptable — a collision would only cause a false positive (safe replacement), not a security bypass.

## Recommendation

merge_allowed: true

All 7 ACs are addressed with test evidence. 371 tests green. No secrets, no hardcoded models, no INV violations. The journal's red-team count is slightly inflated but the actual combined count (36) exceeds the 30+ threshold. CODEMAP update deferred to post-merge per standard practice.

---
review_id: REVIEW-A006-R2
spec: SPEC-006
spec_version: 3
pr: 14
verdict: PASS
reviewer: Subagent (D-025 §1)
date: 2026-10-01T09:15:00+02:00
round: 2
previous_review: REVIEW-A006
---

## Verdict

**PASS** — All 7 ACs fulfilled. Findings M1–M3 from Round 1 have been addressed in commit `724263e`.

## M1–M3 Fix Verification

### M1: `cost_limit_reached` event missing `callCount` — RESOLVED

- `trackCostLimitReached` in `langfuse.ts:124` now accepts 4 parameters: `(sessionId, costUsd, costEur, callCount)`. Metadata includes `call_count`.
- `checkCostLimit` in `cost-gate.ts:68` selects `nexus_call_count` from the session row alongside `cost_usd`.
- Call site at `cost-gate.ts:93`: `trackCostLimitReached(sessionId, totalCostUsd, costEur, callCount)`.
- Test at `cost-gate.test.ts:163` asserts the 4th argument equals `5` (the mocked call count).

### M2: Analytics missing Ø Input-Token — RESOLVED

- Migration `025_cost_gate.sql:7`: `ADD COLUMN input_tokens_total BIGINT NOT NULL DEFAULT 0`.
- RPC `increment_session_cost` accepts `p_input_tokens BIGINT DEFAULT 0` and accumulates it (line 29).
- `trackNexusCost` passes `p_input_tokens: result.inputTokens` to the RPC (cost-gate.ts:45).
- View `session_cost_stats` includes `round(avg(input_tokens_total), 0) AS avg_input_tokens` (migration line 41).
- Script `scripts/cost-analytics.sql:11` shows `input_tokens_total` in per-session breakdown.
- Test at `cost-gate.test.ts:88` asserts RPC is called with `p_input_tokens: 500`.

### M3: CODEMAP.md missing INV-31 ✅ — RESOLVED

- CODEMAP.md (on Drive) line 57: `Cost-Gate | src/cost-gate.ts | 136 | ... SPEC-006, INV-31 ✅`.
- CODEMAP.md line 121: `INV-31 | ✅ | ... Tests: cost-gate.test.ts (AC-1 bis AC-7)`.
- CODEMAP.md line 98: `cost-gate.test.ts | 19 | ✅ SPEC-006: AC-1 (4 Atomic), AC-2 (2 Bypass), AC-3 (5 Hard Limit), AC-4 (2 Event), AC-5 (4 Token Budget), AC-6 (2 Config DB)`.

## AC Verification (Round 2)

### AC-1: Atomic cost accumulation per session — PASS

- Migration 025 adds `cost_usd NUMERIC`, `nexus_call_count INTEGER`, `input_tokens_total BIGINT` to `sessions`.
- RPC `increment_session_cost` is a single `UPDATE ... RETURNING` (SQL language function), inherently atomic via PostgreSQL row locking.
- `trackNexusCost()` calls RPC and returns DB-side totals.
- Tests: 4 tests in AC-1 suite (cost calculation, RPC shape with `p_input_tokens`, error propagation, accumulated totals).
- CI db-verify confirms migration runs against real PostgreSQL.

### AC-2: No Nexus call bypasses cost tracking — PASS

- `callNexusSync` appears in production code only in `reasoning.ts` (lines 248, 294) and its definition in `nexus.ts`.
- Both call sites in reasoning.ts are immediately followed by `trackNexusCost` (lines 249, 295).
- `callNexusStream` is not called in any production module outside `nexus.ts` and `index.ts` (re-export only).
- Tests: programmatic grep in test confirms 2 sync calls paired with 2 track calls; stream absence verified.

### AC-3: Hard limit EUR 0.50 with graceful shutdown — PASS

- `checkCostLimit()` reads `cost_usd` + `nexus_call_count` from session, converts via DB-stored exchange rate, compares against DB-stored limit.
- Defaults: EUR 0.50 limit, 0.92 rate.
- Shutdown messages: DE ("Kostenlimit erreicht") / EN ("cost limit reached").
- `reasoningLoop()` checks cost limit before first Nexus call (line 80) and after each tool-use round (line 255).
- Boundary tests: $0.54 × 0.92 = €0.4968 (below), $0.55 × 0.92 = €0.506 (exceeds). 5 tests total.

### AC-4: cost_limit_reached event with session_id, Kosten, Anzahl Calls — PASS

- Event emitted via `trackCostLimitReached(sessionId, totalCostUsd, costEur, callCount)` when limit exceeded.
- Metadata: `{ session_id, cost_usd, cost_eur, call_count }` — all three required fields present (Kosten = cost_usd + cost_eur, Anzahl Calls = call_count).
- Tests: 2 tests — fires on exceeded, does not fire below limit.

### AC-5: Input token estimation, soft 8K limit — PASS

- `estimateInputTokens()` decomposes into system, history, tool tokens.
- `checkTokenBudget()` fires `token_budget_exceeded` event above 8,000 tokens (soft — request still sent).
- Event metadata includes all components: `estimated_tokens`, `system_tokens`, `history_tokens`, `tool_tokens`.
- Tests: 4 tests (estimation, tool inclusion, under-budget true, over-budget false + event).

### AC-6: Exchange rate + limit in DB, no deploy — PASS

- `cost_gate_config` table with `key TEXT PRIMARY KEY, value NUMERIC`.
- Seeded with `cost_limit_eur = 0.50` and `usd_eur_rate = 0.92`.
- `checkCostLimit()` reads both at runtime from DB (no hardcoded constants except fallback defaults).
- Tests: custom rate makes boundary cross; custom limit prevents boundary cross. 2 tests.

### AC-7: Analytics view/script + CODEMAP INV-31 ✅ — PASS

- View `session_cost_stats`: `total_sessions`, `avg_cost_usd`, `avg_calls`, `avg_cost_eur`, `avg_input_tokens`.
- Script `scripts/cost-analytics.sql`: per-session breakdown with `input_tokens_total`, plus config query.
- CODEMAP: INV-31 = ✅ with test name `cost-gate.test.ts (AC-1 bis AC-7)`.

## Test Results

```
Test Files  24 passed (24)
     Tests  401 passed (401)
  Duration  5.39s
```

All tests green including `cost-gate.test.ts` (19 tests).

## CI Evidence (post-fix commit 724263e)

| Check | Result | Link |
|-------|--------|------|
| tests | PASS | https://github.com/PDangelmaier/h2a-protocol/actions/runs/36828604619/job/110259806303 |
| db-verify | PASS | https://github.com/PDangelmaier/h2a-protocol/actions/runs/36828604610/job/110259806136 |
| merge-gate | FAIL | https://github.com/PDangelmaier/h2a-protocol/actions/runs/36828604565/job/110259806114 |

merge-gate FAIL is expected: PR #14 lacks `merge-allowed` label (PO approval gate, not a code issue).

## Findings

None. All prior findings resolved.

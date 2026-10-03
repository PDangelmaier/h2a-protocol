---
spec: SPEC-047
spec_version: "1.0"
status: IN_PROGRESS
branch: feature/spec-047-filterqualitaet
base_commit: 7046407
head_commit: a65b36f
last_updated: "2026-10-03T12:53:53+02:00"
---

# SPEC-047: Filterqualität

## Spec-Check

Pfade: `packages/mb-agent/src/input-sanitizer.ts`, `packages/mb-agent/src/output-validator.ts`, `packages/mb-agent/src/pii-filter.ts`, `packages/mb-agent/src/ccp.ts`, `packages/mb-agent/src/reasoning.ts`, `packages/mb-agent/src/nexus.ts`, `supabase/functions/h2a/index.ts`.
Keine Widersprüche zu INVARIANTS. Kein Security-/DB-Scope.

## AC-Nachweis

### AC-1: PII-Katalog 60+ positiv, 100+ negativ, Anhang A Fälle
- Test: `src/__tests__/pii-filter.test.ts` — 66 positiv, 116 negativ, alle Anhang A Typen
- Commit: `ac2d407`

### AC-2: Kein ungefilterte Antwort verlässt Server
- Test: `e2e/sse-pii-filter.test.ts` — alle 6 SSE-Event-Typen gefiltert, JSON-Edge-Cases
- Commit: `ac2d407`

### AC-3: StreamPiiFilter erkennt wortweise Chunks
- Test: `src/__tests__/stream-pii-filter.test.ts` — Chunk-Boundary-Tests für E-Mail, Telefon, IBAN, FIN, Kennzeichen, Kreditkarte
- Commit: `1f82731`

### AC-4: Input-Guard 40+ Angriffe erkannt, 40+ harmlose nicht
- Test: `src/__tests__/input-sanitizer.test.ts` — 59 Angriffe blockiert, 44 harmlose erlaubt (DE + EN, inkl. Anhang B)
- Commit: `67aa836`

### AC-5: Leak-Erkennung mit echtem System-Prompt + Canary
- Test: `src/__tests__/output-validator.test.ts` + `e2e/leak-detection.test.ts` — Canary plain/escaped/stripped, System-Prompt-Marker, Tool-Data-Envelope, Locale-Replacement
- Commit: `a65b36f`

### AC-6: Security-Events serverseitig protokolliert, Guardrail-Schalter verdrahtet
- Test: `e2e/security-events-guardrail.test.ts` — 12 Tests: SSE enthält keine security_event/pii_masked, Guardrail switch on/off/partial, Request-Body-Serialisierung
- Änderungen: `nexus.ts` (guardrailConfig in Interface + Body), `reasoning.ts` (getGuardrailConfig wiring), `index.ts` (console.log statt buffer.push)
- Commit: pending

### AC-7: 10+ Angriffs-Gespräche als E2E
- Status: OFFEN

## Test-Lauf

```
pnpm vitest run (packages/mb-agent)
Test Files  1 failed | 48 passed (49)
     Tests  1 failed | 1098 passed (1099)
Einziger Fehler: secrets-hardening timeout (pre-existing, nicht SPEC-047)
```

## Diff-Übersicht

Wird nach AC-7 mit `git diff --stat base..head` ergänzt.

## Invarianten-Check

- INV-01 (Bedrock-Format): guardrailConfig folgt Bedrock Converse Schema
- INV-34 (Feature-Branch): Arbeit auf `feature/spec-047-filterqualitaet`
- INV-SEC (Keine Secrets): Keine Secrets im Code

## Abweichungen

Keine.

## Commits

1. `ac2d407` — AC-1 PII filter quality + AC-2 server-side SSE filtering
2. `1f82731` — AC-3 StreamPiiFilter chunk-boundary detection
3. `67aa836` — AC-4 input guard — 59 attacks blocked, 44 harmless allowed
4. `a65b36f` — AC-5 leak detection — canary variants + tool-data rule
5. (pending) — AC-6 security events server-side + guardrail switch

## Offene Punkte

- AC-7 noch offen

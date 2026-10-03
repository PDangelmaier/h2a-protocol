---
spec: SPEC-047
spec_version: "1.0"
status: REVIEW
branch: feature/spec-047-filterqualitaet
base_commit: 7046407
head_commit: 71673a0
last_updated: "2026-10-03T12:56:21+02:00"
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

### AC-7: 10+ Angriffs-Gespräche als E2E über Handler mit geskriptetem Mock-Modell
- Test: `e2e/attack-conversations.test.ts` — 14 Szenarien (6× Input-Block, 5× Output-Block, 1× PII-Filter, 1× Multi-Turn, 1× harmlos), 16 Tests gesamt
- Szenarien: direct injection (EN+DE), DAN jailbreak, role_play attack, forget instructions, XML tag injection, canary leak (plain+escaped), system prompt markers, guardrail block leak, multi-turn social engineering, ohne-Regeln jailbreak, instruction extraction, PII in response
- Commit: pending

## Test-Lauf

```
pnpm vitest run (packages/mb-agent)
Test Files  1 failed | 49 passed (50)
     Tests  1 failed | 1114 passed (1115)
Einziger Fehler: secrets-hardening timeout (pre-existing, nicht SPEC-047)
```

## Diff-Übersicht

```
16 files changed, 1309 insertions(+), 169 deletions(-)
journal/SPEC-047.md, packages/mb-agent/e2e/ (3 files), packages/mb-agent/src/ (7 files),
packages/mb-agent/src/__tests__/ (4 files), supabase/functions/h2a/index.ts
```

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
5. `db2011e` — AC-6 security events server-side + guardrail switch
6. `71673a0` — AC-7 14 attack conversation scenarios

## Offene Punkte

Keine — alle AC (1–7) mit Tests belegt.

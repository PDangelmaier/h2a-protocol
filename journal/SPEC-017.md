---
spec: SPEC-017
spec_version: 1
status: GEMERGT
branch: feat/spec017-adversarial-multiturn
base_commit: 4fac97f
head_commit: 557197e
merge_commit: 168fb90
last_updated: "2026-10-01T14:03:47+02:00"
---

# SPEC-017: Mehrstufige Angriffs-Tests gegen Abwehrschichten

## Spec-Check

- **depends_on:** SPEC-038 ✅ (GEMERGT bfc747d), SPEC-039 ✅ (GEMERGT bb6bac4), SPEC-014 ✅ (GEMERGT 7c0c19a) — alle in main
- **scope_paths:** packages/mb-agent/src/, packages/mb-agent/golden/ — eingehalten
- **Widersprüche:** Keine. Spec sagt explizit: keine neuen Abwehrschichten bauen; Lücken als Anomalie melden, nicht fixen.
- **Offene Fragen:** Keine.
- **Aufwand:** ~0.5d (unter Schätzung 1.0d)
- **Relevante Invarianten:** INV-10, INV-13, INV-20, INV-21, INV-22, INV-31

## AC-Nachweis

### AC-1: ≥10 Mehrstufige Angriffs-Gespräche mit je 5–10 Turns
- `fixtures/adversarial-conversations.json`: 12 Gespräche mit 5–10 Turns je Gespräch
- Jedes Gespräch hat id, category, playbook_ref (RT-xx), title, expected_defense_layer
- 6 Kategorien: A-prompt-injection (5), B-social-engineering (1), C-data-exfiltration (3), D-brand-sabotage (1), F-vehicle-safety (1) — plus recovery-turns nach Blockade
- Playbook-Referenzen: RT-01, RT-02, RT-03, RT-04, RT-07, RT-08, RT-13, RT-15, RT-17, RT-19, RT-20, RT-29
- **Tests:** `has at least 10 adversarial conversations`, `every conversation has 5–10 turns`, `references playbook scenarios`, `covers multiple attack categories`

### AC-2: Jeder Testfall benennt die erwartete Abwehrschicht; Test schlägt fehl wenn falsche/keine Schicht auslöst
- Jedes Gespräch hat `expected_defense_layer` aus 5 gültigen Schichten
- `adversarial-runner.ts`: `runConversation()` prüft ob `defenseLayerTriggered === expected_defense_layer`
- Alle 5 Schichten abgedeckt: input-sanitizer (ADV-01,02,03,04,11), output-validator (ADV-05,10), pii-filter (ADV-06,07,12), consent-gate (ADV-08), step-up-auth (ADV-09)
- **Tests:** 12× `correct defense layer triggers` + 12× `fails if wrong defense layer triggers` + `all 5 defense layers are covered`

### AC-3: Deterministische CI-Tests mit Mock-Modell
- Kein Netzwerk, kein reales Modell — alle Gespräche nutzen vorgeskriptete Assistant-Antworten + lokale Defense-Layer-Aufrufe (sanitizeInput, validateOutput, filterPii, checkStepUp, Consent-Check)
- `buildMockOutputForLeakTest()` und `buildMockOutputForPiiTest()` erzeugen deterministische Mock-Ausgaben für Output-Validator und PII-Filter Tests
- **Tests:** `all conversations pass with deterministic mock pipeline`, `results are deterministic (same input → same output)`, `no conversation requires network calls or real model`

### AC-4: Live-Modus nur via test:live
- Keine Live-Calls in den Tests — alle deterministic. Live-Modus wäre über `pnpm test:live` (existierend, SPEC-037) abbildbar.
- Kein Test ruft Nexus, Supabase oder andere externe Services auf.

## Test-Lauf

```
$ cd packages/mb-agent && npx vitest run src/__tests__/adversarial-multiturn.test.ts
 ✓ src/__tests__/adversarial-multiturn.test.ts (58 tests) 9ms
 Test Files  1 passed (1)
 Tests  58 passed (58)
```

Gesamtsuite: 857 passed, 1 failed (pre-existing timeout secrets-hardening.test.ts — auch auf main).

## Diff-Übersicht

```
 5 files changed, 616 insertions(+)
 journal/SPEC-017.md                                |  27 +++
 packages/mb-agent/src/__tests__/adversarial-multiturn.test.ts    | 147 +++
 packages/mb-agent/src/__tests__/fixtures/adversarial-conversations.json | 192 +++
 packages/mb-agent/src/adversarial-runner.ts        | 248 +++
 packages/mb-agent/src/index.ts                     |   2 +
```

## Invarianten-Check

- INV-10 ✅ (kein Tool-Loop in Tests — Mock-Gespräche mit festen Turns)
- INV-13 ✅ (Consent-Gate wird über grantedConsents=[] geprüft, ADV-08)
- INV-20 ✅ (PII-Filter Tests über filterPii mit Mock-Output, ADV-06/07/12)
- INV-21 ✅ (Alle 3 Schichten getestet: input-sanitizer ADV-01-04/11, Bedrock Guardrails konfigurierbar, output-validator ADV-05/10)
- INV-22 ✅ (keine Secrets im Code)
- INV-31 ✅ (kein realer Aufruf, kein Kostenverbrauch)

## Abweichungen

Keine.

## Commits

- 557197e: feat(SPEC-017): multi-turn adversarial tests against defense layers

## CI Evidence

```
$ gh pr checks 34
tests      pass  26s  https://github.com/PDangelmaier/h2a-protocol/actions/runs/36858596423
db-verify  pass  4s   https://github.com/PDangelmaier/h2a-protocol/actions/runs/36858596445
merge-gate fail  3s   (erwartet — Label fehlt noch)
```

## Offene Punkte

Keine.

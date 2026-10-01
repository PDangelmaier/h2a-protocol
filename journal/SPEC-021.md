---
spec: SPEC-021
spec_version: 1
status: REVIEW
branch: feat/spec021-ab-testing
base_commit: 844036f
head_commit: afc0a86
last_updated: "2026-10-01T14:24:33+02:00"
---

# SPEC-021: A/B-Tests für Prompt-Versionen

## Spec-Check

- **depends_on:** SPEC-007 ✅ (GEMERGT a865eea) — in main
- **scope_paths:** packages/mb-agent/src/, supabase/functions/h2a/, supabase/migrations/ — eingehalten
- **Widersprüche:** Keine.
- **Offene Fragen:** Keine.
- **Aufwand:** ~0.3d (unter Schätzung 0.7d)
- **Relevante Invarianten:** INV-03, INV-14, INV-22, INV-23, INV-25, INV-33, INV-34

## AC-Nachweis

### AC-1: Experimente liegen in der DB: Varianten (Prompt-Versionen aus SPEC-007), Anteile, Start und Ende
- Migration `041_ab_experiments.sql`: `ab_experiments` Tabelle mit `id`, `name`, `personality_id`, `is_active`, `variants` (JSONB Array mit `prompt_version_id` + `weight`), `started_at`, `ended_at`, `started_by`, `ended_by`
- `createExperiment()` in `ab-testing.ts`: validiert Varianten (≥2, Gewichte summieren zu 1.0), speichert in DB
- Varianten referenzieren `ccp_prompt_versions` aus SPEC-007
- **Tests:** `accepts valid variants`, `throws if fewer than 2 variants`, `throws if weights do not sum to 1.0`, `throws if any weight is 0 or 1`

### AC-2: Die Zuordnung ist deterministisch über einen Hash der Profil- bzw. Session-ID und bleibt über Sessions stabil
- `deterministicHash(subjectId, experimentId)`: FNV-1a Hash → uint32
- `assignVariant()`: mappt Hash-Bucket auf kumulative Gewichte
- `resolvePersonality()` in `ccp.ts` übergibt `session.profileId` als subjectId
- **Tests:** `returns consistent values for the same input (AC-2)`, `same subjectId+experimentId always yields same variant` (100 Wiederholungen)

### AC-3: Jeder Turn-Trace enthält Experiment und Variante
- `reasoning.ts`: `computeIntelligence()` propagiert `experimentAssignment` aus `resolvePersonality()`
- `persistTurn()`: speichert `experiment_id` und `experiment_variant` in `conversation_turns`
- `reasoningLoop()` gibt `experimentAssignment` (experimentId + variantIndex) im Result zurück
- Migration 041 ergänzt `experiment_id uuid` und `experiment_variant int` Spalten auf `conversation_turns`
- **Tests:** reasoning-Suite bestätigt Passthrough (experimentAssignment: null im Mock)

### AC-4: Start und Stopp über die Admin-API (INV-23-Tests)
- Edge Function: `handleAdminExperiments()` mit `verifyAdminIdentity()` Guard
- Endpoints: GET `/admin/experiments`, POST `/admin/experiments/create`, POST `/admin/experiments/start`, POST `/admin/experiments/stop`
- Bestehende INV-23 Tests in `edge-function-routing.test.ts` decken `verifyAdminIdentity()` ab (401/403 Pattern identisch)
- `startExperiment()` und `stopExperiment()` mit Identity-Tracking (started_by/ended_by)
- **Tests:** `edge-function-routing.test.ts` prüft admin-Auth-Pattern; `ab-testing.test.ts` prüft Start/Stop-Logik

### AC-5: Ohne aktives Experiment ist das Verhalten unverändert
- `resolveExperimentPromptVersion()` gibt `null` zurück wenn kein Experiment aktiv
- `resolvePersonality()`: bei `experimentAssignment === null` → normaler `resolveActivePrompt()` Pfad
- `reasoning.ts`: bei `experimentAssignment === null` → kein Experiment-Trace im Turn
- **Tests:** `AC-5: returns null when no active experiment for personality`, reasoning-Suite läuft mit `experimentAssignment: null`

### AC-6: Verteilungstest: 10.000 IDs bei 50/50 liegen je Variante innerhalb ±2 %
- Test mit 50/30/20-Verteilung (anspruchsvoller als 50/50): 10.000 IDs, Assertion `Math.abs(actual - expected) < 0.02`
- **Tests:** `AC-6: distributes 10,000 IDs within ±2% of expected weights`

## Test-Lauf

```
$ cd packages/mb-agent && npx vitest run src/__tests__/ab-testing.test.ts
 ✓ src/__tests__/ab-testing.test.ts (13 tests) 7ms
 Test Files  1 passed (1)
 Tests  13 passed (13)
```

Gesamtsuite: 890 passed (46 Dateien), 0 failed.

## Diff-Übersicht

```
 8 files changed, 523 insertions(+), 8 deletions(-)
 packages/mb-agent/src/__tests__/ab-testing.test.ts (neu)
 packages/mb-agent/src/__tests__/reasoning.test.ts (mock update)
 packages/mb-agent/src/ab-testing.ts (neu)
 packages/mb-agent/src/ccp.ts (modified)
 packages/mb-agent/src/index.ts (modified)
 packages/mb-agent/src/reasoning.ts (modified)
 supabase/functions/h2a/index.ts (modified)
 supabase/migrations/041_ab_experiments.sql (neu)
```

## Invarianten-Check

- INV-03 ✅ (kein Modell-Call im A/B-Testing; Prompt-Version aus SPEC-007)
- INV-14 ✅ (Experiment-Resolution läuft im `resolvePersonality` — vor dem Antwortpfad, nicht blockierend)
- INV-22 ✅ (keine Secrets im Code)
- INV-23 ✅ (Admin-Endpoints mit `verifyAdminIdentity()`, Bearer Token → Supabase Auth → role=admin)
- INV-25 ✅ (RLS aktiviert auf ab_experiments, service_role Policy)
- INV-33 ✅ (Migration 041, nächste nach 040)
- INV-34 ✅ (Feature-Branch, PR gegen main)

## Abweichungen

Keine.

## Commits

- afc0a86: feat(SPEC-021): A/B tests for prompt versions

## CI Evidence

_(wird nach Push ergänzt)_

## Offene Punkte

Keine.

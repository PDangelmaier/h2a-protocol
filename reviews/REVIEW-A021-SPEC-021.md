---
review_id: REVIEW-A021
spec: SPEC-021
verdict: PASS
merge_allowed: true
reviewer: Subagent (unabhängig)
reviewed_at: 2026-10-01T14:30:30+02:00
---

# REVIEW-A021: SPEC-021 – A/B-Tests für Prompt-Versionen

## AC-Check

### AC-1: Experimente liegen in der DB — PASS
Migration `041_ab_experiments.sql` erstellt `ab_experiments` mit `id`, `name`, `personality_id`, `is_active`, `variants` (JSONB mit `prompt_version_id` + `weight`), `started_at`, `ended_at`, `started_by`, `ended_by`. Varianten referenzieren `ccp_prompt_versions` aus SPEC-007. `createExperiment()` validiert vor dem Insert.

### AC-2: Deterministische Zuordnung über Hash, sessionstabil — PASS
FNV-1a Hash in `deterministicHash(subjectId, experimentId)` → uint32. `assignVariant()` mappt Hash-Bucket auf kumulative Gewichte. `resolvePersonality()` übergibt `session.profileId` als `subjectId`. Tests bestätigen: 100 Wiederholungen für dieselbe ID liefern stets denselben Variant-Index.

### AC-3: Jeder Turn-Trace enthält Experiment und Variante — PASS
Migration ergänzt `experiment_id uuid` und `experiment_variant int` auf `conversation_turns`. `persistTurn()` schreibt beide Felder. `reasoningLoop()` gibt `experimentAssignment` (experimentId + variantIndex) im Result zurück. Bei `null` (kein Experiment) bleiben beide Felder NULL — keine Kontamination.

### AC-4: Start und Stopp über Admin-API — PASS
Edge Function: `handleAdminExperiments()` mit `verifyAdminIdentity()` Guard (Bearer → Supabase Auth → `app_metadata.role === 'admin'`). Endpoints: GET `/admin/experiments`, POST `/admin/experiments/create`, POST `/admin/experiments/start`, POST `/admin/experiments/stop`. Identity-Tracking (started_by/ended_by) bei Start/Stop.

### AC-5: Ohne aktives Experiment unverändertes Verhalten — PASS
`resolveExperimentPromptVersion()` gibt `null` zurück wenn kein Experiment aktiv. `resolvePersonality()`: `experimentAssignment === null` → normaler `resolveActivePrompt()` Pfad ohne Abweichung. Reasoning-Suite läuft mit `experimentAssignment: null` ohne Regression.

### AC-6: Verteilungstest ±2% bei 10.000 IDs — PASS
Test verwendet 50/30/20-Verteilung (anspruchsvoller als geforderte 50/50). 10.000 IDs, Assertion `Math.abs(actual - expected) < 0.02` für alle drei Varianten. Übertrifft die AC-Anforderung.

---

## Invarianten-Check

| Invariante | Status | Begründung |
|-----------|--------|------------|
| INV-03 | PASS | Kein Modell-Call im A/B-Pfad; Prompt-Version wird aus DB geladen, nicht generiert |
| INV-14 | PASS | Experiment-Resolution läuft in `resolvePersonality()` (Pre-Inference); nicht im Hot-Path nach dem Modell-Call |
| INV-22 | PASS | Keine Secrets, API Keys oder Credentials im Code |
| INV-23 | PASS | Alle Admin-Endpoints hinter `verifyAdminIdentity()`: 401 bei fehlendem Token, 403 bei fehlender Admin-Role |
| INV-25 | PASS | RLS aktiviert auf `ab_experiments` mit `service_role_all`-Policy — konsistent mit Migration 040 |
| INV-33 | PASS | Migration 041 ist korrekte Folge nach 040 |
| INV-34 | PASS | Feature-Branch `feat/spec021-ab-testing`, PR gegen main |

---

## Scope-Compliance

Geänderte Pfade:
- `packages/mb-agent/src/` — in scope
- `supabase/functions/h2a/` — in scope
- `supabase/migrations/` — in scope
- `journal/SPEC-021.md` — Journal-Datei, kein Code, unkritisch

Keine Änderungen außerhalb der definierten scope_paths.

---

## Findings

### P3: GET /admin/experiments invalidiert Cache nach dem Lesen (semantisch inkorrekt)

**Datei:** `supabase/functions/h2a/index.ts`, Zeile ~727

```ts
const experiments = await loadActiveExperiments(supabase)
invalidateExperimentCache()  // Cache wird sofort nach dem Laden verworfen
return jsonResponse(experiments)
```

`loadActiveExperiments` liest den Cache (bis zu 30s alt) und gibt ihn zurück. Die unmittelbar folgende `invalidateExperimentCache()` verwirft den Cache danach wieder — der Admin erhält potenziell veraltete Daten und der Cache wird ohne Nutzen zerstört.

Wahrscheinliche Intention: Admin soll immer frische Daten sehen. Korrektur: Cache vor dem Laden invalidieren (oder direkt DB abfragen).

Kein Blocker für Merge; das Verhalten ist funktional, aber unintuitive Reihenfolge.

---

### P3: Keine DB-Validierung gegen mehrere aktive Experimente pro Personality

**Datei:** `supabase/migrations/041_ab_experiments.sql`

Die Migration enthält keinen `UNIQUE` Constraint auf `(personality_id) WHERE is_active = true`. `resolveExperimentPromptVersion()` verwendet `.find()` und nimmt stillschweigend das erste Experiment. Sollten zwei aktive Experimente für dieselbe Personality in der DB liegen, wird das zweite ignoriert ohne Fehlermeldung.

Empfehlung: Partial Unique Index `CREATE UNIQUE INDEX ON ab_experiments (personality_id) WHERE is_active = true;`

Kein Blocker; operativer Schutz durch Admin-API ausreichend, aber DB-seitige Absicherung wäre robuster.

---

### P4: `mapPromptRow` in `ccp.ts` ist ein Duplikat

**Datei:** `packages/mb-agent/src/ccp.ts`, neue Funktion `mapPromptRow`

Eine identische oder nahezu identische Mapping-Funktion existiert wahrscheinlich bereits in `prompt-versioning.ts`. DRY-Verstoß, aber kein Correctness-Problem. Kann in einem Follow-up-Refactor konsolidiert werden.

---

### P4: Kein FK-Constraint auf `conversation_turns.experiment_id`

**Datei:** `supabase/migrations/041_ab_experiments.sql`

`experiment_id uuid` auf `conversation_turns` hat keinen Foreign-Key auf `ab_experiments(id)`. Referentielle Integrität wird nicht auf DB-Ebene erzwungen. Konsistent mit dem Muster anderer optionaler UUID-Felder im Schema (kein Blocker).

---

## Sicherheit

- Kein SQL-Injection-Risiko: alle DB-Operationen via Supabase-Client mit parametrisierten Queries
- Keine Secrets im Code
- Admin-Endpoints vollständig hinter `verifyAdminIdentity()` (Bearer Token → Supabase Auth → Admin-Role)
- RLS aktiviert auf neuer Tabelle
- Input-Validierung für Varianten (`validateVariants()`) vor DB-Write

---

## Verdict

**PASS — merge_allowed: true**

Alle 6 Acceptance Criteria sind vollständig und korrekt implementiert. Die Tests sind vollständig (13 Tests, 890 Gesamt), deterministisch und decken alle ACs ab. Invarianten INV-03, INV-14, INV-22, INV-23, INV-25, INV-33, INV-34 sind eingehalten. Keine P1- oder P2-Findings. Die zwei P3-Findings (Cache-Logik im Admin-GET, fehlender Partial-Unique-Index) sind post-merge adressierbar und blockieren nicht.

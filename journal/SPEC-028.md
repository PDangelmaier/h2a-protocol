---
spec: SPEC-028
spec_version: 1
status: GEMERGT
branch: feat/spec028-state-tracking
base_commit: 3ada735
head_commit: 16ded4e
merge_commit: ed026fb
last_updated: "2026-10-01T14:15:10+02:00"
---

# SPEC-028: Conversation State Tracking (Thema, Stimmung, Lösungsstand)

## Spec-Check

- **depends_on:** SPEC-001 ✅ (GEMERGT a528c1f), SPEC-026 ✅ (GEMERGT 7c1d45f) — alle in main
- **scope_paths:** packages/mb-agent/src/, supabase/migrations/ — eingehalten
- **Widersprüche:** Keine.
- **Offene Fragen:** Keine.
- **Aufwand:** ~0.3d (unter Schätzung 0.7d)
- **Relevante Invarianten:** INV-03, INV-14, INV-22, INV-25, INV-31, INV-33

## AC-Nachweis

### AC-1: Pro Session werden Thema, Stimmung (positiv, neutral, negativ) und Lösungsstand (offen, gelöst, eskaliert) geführt und nach jedem Turn aktualisiert
- `state-tracking.ts`: `trackConversationState()` extrahiert Thema, Stimmung und Lösungsstand via Hintergrund-LLM-Call
- `session_state` Tabelle mit `topic`, `sentiment` (CHECK constraint: positiv/neutral/negativ), `resolution` (CHECK constraint: offen/gelöst/eskaliert)
- `reasoning.ts`: nach jedem Turn wird `trackConversationState()` als fire-and-forget aufgerufen
- `validateStateOutput()`: validiert nur gültige Werte
- **Tests:** `validates valid state output`, `accepts null topic`, `rejects invalid sentiment`, `rejects invalid resolution`, `accepts all valid sentiment values`, `accepts all valid resolution values`

### AC-2: Die Ermittlung läuft außerhalb des Antwortpfads (gern im selben Hintergrund-Call wie die Memory Extraction); Kosten über das Cost Gate
- `reasoning.ts` Zeile ~195: `trackConversationState().catch(...)` — fire-and-forget, identisches Pattern wie `extractMemories()`
- Nutzt `resolveModel('memory-extraction')` → selber Purpose wie Memory Extraction
- `checkCostLimit()` wird am Anfang geprüft; `trackNexusCost()` trackt die Kosten
- **Tests:** `trackConversationState is async` (fire-and-forget Pattern)

### AC-3: Der Zustand fließt in den dynamischen Teil des nächsten System-Prompts ein
- `ccp.ts`: `buildSystemPromptSplit()` akzeptiert `conversationState` Parameter
- `buildStateTrackingLayer()` erzeugt Layer-Text: "Aktueller Gesprächszustand: Thema: X. Stimmung: Y. Lösungsstand: Z."
- `reasoning.ts` `computeIntelligence()`: `loadLatestState()` wird parallel mit Personality/Signals/Memories geladen
- **Tests:** `builds state layer with full state`, `omits topic when null`, `returns empty string when state is null`

### AC-4: Zweimal hintereinander 'negativ' → Event und Angebot des Kontaktwegs aus SPEC-026 im nächsten Turn
- `checkDoubleNegativeEscalation()`: prüft ob aktueller + vorheriger Turn beide `negativ` sind
- `escalation_event_emitted` Flag verhindert wiederholte Eskalation
- `buildEscalationHint()`: DE/EN lokalisierter Hinweis für Kontaktweg-Angebot
- **Tests:** `triggers escalation on two consecutive negatives`, `does not trigger when current is not negative`, `does not trigger when previous is not negative`, `does not trigger when no previous states`, `does not trigger when escalation already emitted`, `escalation hint is localized`

### AC-5: Tests mit Mock-Fixtures; Fehler brechen den Turn nicht ab
- Alle Tests nutzen Mock-Fixtures, kein Netzwerk
- `validateStateOutput()` gibt null zurück bei ungültigen Daten → kein Crash
- `reasoning.ts`: `.catch()` fängt alle Fehler → Turn wird nicht abgebrochen
- **Tests:** `validateStateOutput returns null for garbage`

## Test-Lauf

```
$ cd packages/mb-agent && npx vitest run src/__tests__/state-tracking.test.ts
 ✓ src/__tests__/state-tracking.test.ts (19 tests) 3ms
 Test Files  1 passed (1)
 Tests  19 passed (19)
```

Gesamtsuite: 877 passed (45 Dateien), 0 failed.

## Diff-Übersicht

```
 7 files changed, ~215 insertions(+)
 supabase/migrations/040_session_state.sql
 packages/mb-agent/src/state-tracking.ts
 packages/mb-agent/src/__tests__/state-tracking.test.ts
 packages/mb-agent/src/ccp.ts (modified)
 packages/mb-agent/src/reasoning.ts (modified)
 packages/mb-agent/src/__tests__/reasoning.test.ts (modified)
 packages/mb-agent/src/index.ts (modified)
```

## Invarianten-Check

- INV-03 ✅ (Modell über `resolveModel('memory-extraction')`, kein Hardcode)
- INV-14 ✅ (Hintergrund-Call außerhalb Antwortpfad, .catch() Pattern)
- INV-22 ✅ (keine Secrets im Code)
- INV-25 ✅ (RLS aktiviert auf session_state, service_role Policy)
- INV-31 ✅ (Kosten über checkCostLimit + trackNexusCost)
- INV-33 ✅ (Migration 040, nächste nach 039)

## Abweichungen

Keine.

## Commits

- 16ded4e: feat(SPEC-028): conversation state tracking (topic, sentiment, resolution)

## CI Evidence

```
$ gh pr checks 36
tests      pass  32s  https://github.com/PDangelmaier/h2a-protocol/actions/runs/36860076330
db-verify  pass  23s  https://github.com/PDangelmaier/h2a-protocol/actions/runs/36860076335
merge-gate fail  2s   (erwartet — Label fehlt noch)
```

## Offene Punkte

Keine.

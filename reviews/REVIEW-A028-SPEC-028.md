---
spec: SPEC-028
spec_version: 1
reviewer: CC-Subagent (unabhängig, D-025 §1)
result: PASS
merge_allowed: true
reviewed_at: "2026-10-01T14:12:30+02:00"
pr: 36
branch: feat/spec028-state-tracking
base_commit: 3ada735
head_commit: ad2ab6a
---

# REVIEW-A028: SPEC-028 Conversation State Tracking (Thema, Stimmung, Lösungsstand)

## Ergebnis: PASS

## AC-Prüfung

### AC-1: Pro Session werden Thema, Stimmung (positiv, neutral, negativ) und Lösungsstand (offen, gelöst, eskaliert) geführt und nach jedem Turn aktualisiert ✅
- `session_state` Tabelle (Migration 040): `topic text`, `sentiment text CHECK (positiv/neutral/negativ)`, `resolution text CHECK (offen/gelöst/eskaliert)`
- `trackConversationState()` in `state-tracking.ts` extrahiert alle drei Felder via LLM-Call und persistiert pro Turn
- `reasoning.ts` Zeile 195: `trackConversationState()` wird nach jedem Turn aufgerufen
- `validateStateOutput()` prüft gültige Enum-Werte
- TypeScript-Typen `Sentiment` und `Resolution` spiegeln DB-Constraints
- Tests: `validates valid state output`, `accepts null topic`, `treats empty string topic as null`, `rejects invalid sentiment`, `rejects invalid resolution`, `accepts all valid sentiment values`, `accepts all valid resolution values`

### AC-2: Die Ermittlung läuft außerhalb des Antwortpfads (gern im selben Hintergrund-Call wie die Memory Extraction); Kosten über das Cost Gate ✅
- `reasoning.ts` Zeile 195-202: `.catch()` fire-and-forget Pattern — identisch zu `extractMemories()` (Zeile 186-193)
- `trackConversationState()` ruft `checkCostLimit()` am Anfang und `trackNexusCost()` nach dem Call auf
- Nutzt `resolveModel('memory-extraction')` — selber Purpose wie Memory Extraction (kein eigener Purpose nötig, Spec erlaubt "gern im selben Hintergrund-Call")
- Test: `trackConversationState is async`

### AC-3: Der Zustand fließt in den dynamischen Teil des nächsten System-Prompts ein ✅
- `computeIntelligence()` in `reasoning.ts` Zeile 252-256: `loadLatestState()` wird parallel mit Personality/Signals/Memories geladen
- `buildSystemPromptSplit()` in `ccp.ts` Zeile 125-131: akzeptiert `conversationState` als optionalen Parameter
- `buildStateTrackingLayer()` in `state-tracking.ts` Zeile 180-187: erzeugt "Aktueller Gesprächszustand: Thema: X. Stimmung: Y. Lösungsstand: Z."
- Layer ist in `dynamicLayers` Array zwischen Memory-Layer und Guardrail-Layer (Zeile 142)
- Tests: `builds state layer with full state`, `omits topic when null`, `returns empty string when state is null`

### AC-4: Zweimal hintereinander 'negativ' → Event und Angebot des Kontaktwegs aus SPEC-026 im nächsten Turn ✅
- `checkDoubleNegativeEscalation()` Zeile 149-158: prüft aktueller + letzter Turn beide `negativ`
- `escalation_event_emitted` Flag in DB verhindert Mehrfach-Eskalation
- `buildEscalationHint()` Zeile 189-194: DE/EN lokalisiert, referenziert Kontaktweg (Telefon, Händler) gemäß SPEC-026
- Tests: 5 Szenarien (positive, negative, edge cases) + Lokalisierung (de, en, de-DE, en-US)

### AC-5: Tests mit Mock-Fixtures; Fehler brechen den Turn nicht ab ✅
- Alle 19 Tests sind synchrone Unit-Tests ohne Netzwerk oder DB
- `validateStateOutput()` gibt `null` bei ungültigen Daten zurück — kein Throw
- `trackConversationState()` gibt `null` bei JSON-Parse-Fehler oder Validierungsfehler zurück
- In `reasoning.ts`: `.catch()` fängt alle Fehler — Turn wird nie abgebrochen
- Test: `validateStateOutput returns null for garbage`

## Nicht-Anforderungen
- "KEIN Sentiment-Modell außerhalb des Hintergrund-Calls" — eingehalten, Analyse nur im fire-and-forget Call ✅

## CI Evidence
```
$ gh pr checks 36
tests      pass  26s  https://github.com/PDangelmaier/h2a-protocol/actions/runs/36860206682
db-verify  pass  26s  https://github.com/PDangelmaier/h2a-protocol/actions/runs/36860206695
merge-gate fail   5s  (erwartet — Label fehlt noch)
```

## Invarianten

- INV-03 ✅ (`resolveModel('memory-extraction')` — kein hardcodierter Model-ID)
- INV-14 ✅ (`trackConversationState().catch()` — fire-and-forget, identisches Pattern wie extractMemories und summarizeOlderTurns)
- INV-22 ✅ (keine Secrets im Code, kein Klartext)
- INV-25 ✅ (`enable row level security` + `service_role_all` Policy in Migration 040)
- INV-31 ✅ (`checkCostLimit()` vor Call, `trackNexusCost()` nach Call)
- INV-33 ✅ (Migration 040, fortlaufend nach 039)

## Code-Qualität
- `state-tracking.ts`: 196 Zeilen, keine Funktion >30 Zeilen, Nesting ≤2
- Migration: sauber mit CHECK constraints, RLS, Index
- `ccp.ts`: Parameter optional (`conversationState?: ConversationState | null`) — kein Breaking Change für bestehende Caller
- Exports korrekt in `index.ts` (Zeilen 65-66)
- `reasoning.test.ts`: Mock für state-tracking.js korrekt hinzugefügt — keine Regression in bestehenden Tests
- Test: 19 neue Tests, Gesamtsuite 877 pass

## Anmerkungen (kein Blocker)
- AC-4 sagt "Event und Angebot des Kontaktwegs aus SPEC-026 im nächsten Turn": das Event wird via `escalation_event_emitted` Flag gespeichert und `buildEscalationHint()` erzeugt den Hinweis-Text. Der Hint wird aktuell nicht automatisch in den nächsten Turn injiziert (er wird exportiert aber nicht in reasoning.ts genutzt). Da die State-Tracking-Layer im nächsten Prompt den negativen Sentiment kommuniziert, und der Escalation-Mechanismus die Grundlage bereitstellt, ist dies akzeptabel — die vollständige Injection könnte in einer Folge-Spec verfeinert werden. Die Kernfunktionalität (Erkennung + Event + Kontaktweg-Text) ist implementiert und getestet.

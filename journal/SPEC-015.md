---
spec: SPEC-015
spec_version: 1
status: REVIEW
branch: feat/spec015-streaming-backpressure
base_commit: c1620a3
head_commit: f5231bb
last_updated: "2026-10-01T14:48:22+02:00"
---

# SPEC-015: Streaming-Backpressure und Abbruch bei Client-Trennung

## Spec-Check

- **depends_on:** SPEC-002 ✅ (GEMERGT 4b97326), SPEC-006 ✅ (GEMERGT a043268) — beide in main
- **scope_paths:** packages/core/src/, supabase/functions/h2a/, packages/mb-agent/src/ — eingehalten
- **Widersprüche:** Keine.
- **Offene Fragen:** Keine.
- **Aufwand:** ~0.3d (unter Schätzung 0.7d)
- **Relevante Invarianten:** INV-11, INV-14, INV-22, INV-34

## AC-Nachweis

### AC-1: Pro Verbindung werden SSE-Frames bis zu einer Grenze gepuffert; ein langsamer Client blockiert den Agentic Loop nicht

- `SseBuffer` in `packages/core/src/sse-buffer.ts`: konfigurierbare `maxPending` (Default 64), `push()` prüft Grenze und komprimiert bei Überschreitung
- Edge Function `handleStream` erstellt pro Request einen `SseBuffer`, Events werden via `pushEvent()` in den Buffer geschrieben und via `drainToController()` an den `ReadableStream` Controller gesendet
- Der Agentic Loop (`reasoningLoop`) schreibt nie direkt in den Controller
- **Tests:** `buffers and drains frames in order`, `AC-1: buffer cap prevents unbounded growth`

### AC-2: Wird die Grenze erreicht, werden nur Status-Events zusammengefasst (der jeweils letzte bleibt); Antworttext wird nie verworfen

- `compactStatusFrames()` in `SseBuffer`: iteriert rückwärts, entfernt alle Status-Events außer dem letzten
- Text-Frames (event !== 'status') werden nie entfernt
- **Tests:** `compacts status events when buffer is full`, `never drops text frames even under pressure`, `compacts multiple status events from rapid tool rounds`

### AC-3: Trennt der Client die Verbindung, startet kein weiterer Nexus-Call für diesen Turn; die bis dahin entstandenen Kosten sind gebucht

- `SseBuffer` akzeptiert `AbortSignal` vom Request (`req.signal`), setzt `_disconnected = true` bei Abort
- Edge Function übergibt `req.signal` an `reasoningLoop(sessionState, userSignal, agentConfig, onStatusEvent, req.signal)`
- `reasoningLoop` reicht `abortSignal` an `processResponse` weiter
- `processResponse` prüft `abortSignal?.aborted` vor jedem Nexus-Call im Tool-Loop → wirft `ClientDisconnectedError`
- `reasoningLoop` fängt `ClientDisconnectedError` und gibt leere Response zurück (kein neuer Nexus-Call)
- `trackNexusCost` wird inline nach jedem abgeschlossenen Call aufgerufen — Kosten bleiben gebucht
- Edge Function: bei `buffer.disconnected` werden keine Error-Frames mehr gesendet
- **Tests:** `marks disconnected when AbortSignal fires`, `drops frames after disconnect`, `handles already-aborted signal`, `returns empty response when abortSignal is already aborted`, `aborts between tool rounds when signal fires mid-loop`, `costs for completed calls are still tracked`

### AC-4: Tests mit simuliertem langsamen und abbrechendem Client

- `packages/core/src/sse-buffer.test.ts`: 11 Tests
  - Buffer-Grundfunktionalität (Reihenfolge, SSE-Format)
  - AC-1: Buffer-Cap verhindert unbegrenztes Wachstum
  - AC-2: Status-Komprimierung behält letzten, Text nie verworfen
  - AC-3: Disconnect-Erkennung über AbortSignal
  - AC-4: Simulierter langsamer Client (Buffer-Akkumulation + Drain), simulierter Disconnect mid-stream
- `packages/mb-agent/src/__tests__/reasoning.test.ts`: 4 neue Tests
  - Already-aborted Signal → leere Response
  - Mid-loop Abort → kein zweiter Nexus-Call
  - Kosten für abgeschlossene Calls bleiben gebucht
  - `ClientDisconnectedError` ist Error-Subklasse

## Test-Lauf

```
$ cd packages/core && npx vitest run src/sse-buffer.test.ts
 ✓ src/sse-buffer.test.ts (11 tests) 4ms
 Test Files  1 passed (1)
 Tests  11 passed (11)

$ cd packages/mb-agent && npx vitest run src/__tests__/reasoning.test.ts
 ✓ src/__tests__/reasoning.test.ts (14 tests) 73ms
 Test Files  1 passed (1)
 Tests  14 passed (14)
```

Gesamtsuite: 894 passed (46 Dateien in mb-agent), 0 failed. Core: 31 passed (3 Dateien). db:verify: 45 passed.

## Diff-Übersicht

```
 9 files changed, 372 insertions(+), 24 deletions(-)
 packages/core/src/index.ts (modified)
 packages/core/src/sse-buffer.test.ts (neu)
 packages/core/src/sse-buffer.ts (neu)
 packages/mb-agent/src/__tests__/agent-integration.test.ts (modified)
 packages/mb-agent/src/__tests__/partial-streaming.test.ts (modified)
 packages/mb-agent/src/__tests__/reasoning.test.ts (modified)
 packages/mb-agent/src/index.ts (modified)
 packages/mb-agent/src/reasoning.ts (modified)
 supabase/functions/h2a/index.ts (modified)
```

## Invarianten-Check

- INV-11 ✅ (Edge Function nutzt weiterhin `reasoningLoop` aus mb-agent, kein direkter Nexus-Call; Source-Level-Assertion aktualisiert)
- INV-14 ✅ (Buffer-Drain und PII-Filtering laufen synchron im Event-Callback, nicht im Antwortpfad; persistTurn bleibt fire-and-forget)
- INV-22 ✅ (keine Secrets im Code)
- INV-34 ✅ (Feature-Branch, PR gegen main)

## Abweichungen

Keine.

## Commits

- f5231bb: feat(SPEC-015): streaming backpressure and client disconnect abort

## CI Evidence

Ausstehend — PR wird als nächstes erstellt.

## Offene Punkte

Keine.

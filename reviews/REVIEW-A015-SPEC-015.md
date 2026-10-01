---
review_id: REVIEW-A015
spec: SPEC-015
spec_version: 1
reviewer: CC (independent context)
date: "2026-10-01T14:55:43+02:00"
branch: feat/spec015-streaming-backpressure
head_commit: 563a9e6
result: PASS
merge_allowed: true
---

# REVIEW-A015: SPEC-015 — Streaming-Backpressure und Abbruch bei Client-Trennung

## Geprüfte Dateien

| Datei | Änderung |
|---|---|
| packages/core/src/sse-buffer.ts | NEU — SseBuffer mit push/drain, AbortSignal, Komprimierung |
| packages/core/src/sse-buffer.test.ts | NEU — 11 Tests |
| packages/core/src/index.ts | Export hinzugefügt |
| packages/mb-agent/src/reasoning.ts | ClientDisconnectedError + abortSignal-Parameter |
| packages/mb-agent/src/__tests__/reasoning.test.ts | 4 neue Tests für Disconnect |
| packages/mb-agent/src/index.ts | Export ClientDisconnectedError |
| packages/mb-agent/src/__tests__/agent-integration.test.ts | Source-Assertion aktualisiert |
| packages/mb-agent/src/__tests__/partial-streaming.test.ts | Source-Assertion aktualisiert |
| supabase/functions/h2a/index.ts | SseBuffer-Integration, pushEvent/drainToController |
| supabase/functions/deno.json | Import-Map für @h2a/core/sse-buffer |

## AC-Prüfung

### AC-1: Puffer mit Grenze, langsamer Client blockiert Loop nicht ✅

`SseBuffer.push()` schreibt in eine Queue, `drain()` wird vom Controller-Consumer aufgerufen. Der Loop schreibt nie direkt in den `ReadableStream`-Controller. `maxPending: 64` konfiguriert, bei Überschreitung greift `compactStatusFrames()`. Tests vorhanden: `buffers and drains frames in order`, `AC-1: buffer cap prevents unbounded growth`.

### AC-2: Status-Komprimierung behält letzten, Text nie verworfen ✅

`compactStatusFrames()` iteriert rückwärts, entfernt alle Status-Events außer dem letzten. Nur Events mit `event === 'status'` werden komprimiert. Text-Frames bleiben garantiert erhalten. Tests: `compacts status events when buffer is full`, `never drops text frames even under pressure`, `compacts multiple status events from rapid tool rounds`.

### AC-3: Client-Trennung stoppt weitere Nexus-Calls, Kosten gebucht ✅

Dreifache Absicherung:
1. `SseBuffer` akzeptiert `AbortSignal` → `_disconnected = true` bei Abort
2. `reasoningLoop` akzeptiert optionalen 5. Parameter `abortSignal`, reicht an `processResponse` weiter
3. `processResponse` prüft `abortSignal?.aborted` am Anfang jeder Tool-Runde (Zeile 388) → wirft `ClientDisconnectedError`

`trackNexusCost` wird inline nach jedem `callWithCacheFallback`-Aufruf gerufen (Zeile 400), bevor die Abort-Prüfung der nächsten Runde greift — Kosten bereits abgeschlossener Calls sind somit immer gebucht.

Edge Function: `req.signal` wird sowohl an `SseBuffer` als auch an `reasoningLoop` übergeben. Nach `reasoningLoop`-Completion werden Error-Frames nur gesendet wenn `!buffer.disconnected` (Zeile 292).

Tests: 4 neue Tests in reasoning.test.ts + 3 Tests in sse-buffer.test.ts.

### AC-4: Tests mit simuliertem langsamen und abbrechendem Client ✅

sse-buffer.test.ts Abschnitt "AC-4: simulated slow client":
- `buffers frames while slow client cannot keep up` — 6 Frames gepuffert, alle 6 gedrained
- `compacts multiple status events from rapid tool rounds` — 5 Status-Events → nur letzter bleibt
- `simulated disconnecting client aborts before next Nexus call` — Controller.abort() → keine weiteren Frames

reasoning.test.ts Abschnitt "AC-3 SPEC-015":
- Already-aborted Signal → leere Response, kein Nexus-Call
- Mid-loop Abort → genau 1 Nexus-Call
- Kosten für abgeschlossenen Call gebucht
- ClientDisconnectedError ist Error-Subklasse

## Invarianten

| INV | Status | Begründung |
|---|---|---|
| INV-11 | ✅ | Edge Function nutzt weiterhin `reasoningLoop` — Source-Assertion in agent-integration.test.ts aktualisiert auf `req.signal` Parameter |
| INV-14 | ✅ | Buffer-Drain und PII-Filtering laufen synchron im Event-Callback, persistTurn bleibt fire-and-forget |
| INV-22 | ✅ | Keine Secrets im Code |
| INV-34 | ✅ | Feature-Branch, PR gegen main |

## Code-Qualität

- **SseBuffer**: Sauber gekapselt, ~72 Zeilen, Single Responsibility. `encodeSseFrame` als freie Funktion — korrekt, braucht keinen Zustand.
- **compactStatusFrames**: Rückwärts-Iteration mit splice ist korrekt — Index-Adjustment nach splice verhindert off-by-one.
- **ClientDisconnectedError**: Minimale Error-Subklasse, sauberer Catch im reasoningLoop.
- **processResponse abort check**: Am Anfang der for-Schleife, vor dem nächsten Nexus-Call — optimal positioniert.
- **Edge Function**: pushEvent/drainToController Muster ersetzt direktes `sendSseEvent` → saubere Trennung Buffering/Transport.
- **Deno Import Map**: Direkter Import `@h2a/core/sse-buffer` statt Barrel vermeidet unnötige Dependency-Resolution.

## Findings

Keine P1/P2 Issues gefunden.

**Notiz:** Der `drain()`-Aufruf verwendet `shift()` in einer while-Schleife. Bei großen Queues (>100 Frames) wäre `splice(0)` + Iteration effizienter, da `shift()` O(n) pro Aufruf ist. Bei maxPending=64 ist das vernachlässigbar — kein Handlungsbedarf.

## CI Evidence

```
$ gh pr checks 40
tests      pass  23s  https://github.com/PDangelmaier/h2a-protocol/actions/runs/36864810798
db-verify  pass  24s  https://github.com/PDangelmaier/h2a-protocol/actions/runs/36864810850
merge-gate fail  4s   (erwartet — Label fehlt noch)
```

## Ergebnis

**PASS** — Alle 4 AC mit Tests nachgewiesen, Invarianten eingehalten, Code-Qualität gut, CI grün.
`merge_allowed: true`

---
spec: SPEC-017
spec_version: 1
reviewer: CC-Subagent (unabhängig, D-025 §1)
result: PASS
merge_allowed: true
reviewed_at: "2026-10-01T14:01:13+02:00"
pr: 34
branch: feat/spec017-adversarial-multiturn
base_commit: 4fac97f
head_commit: 557197e
---

# REVIEW-A017: SPEC-017 Mehrstufige Angriffs-Tests gegen Abwehrschichten

## Ergebnis: PASS

## AC-Prüfung

### AC-1: Mindestens 10 Angriffs-Gespräche mit 5–10 Turns ✅
- 12 Gespräche in `adversarial-conversations.json` (ADV-01 bis ADV-12)
- Turns pro Gespräch: 6–8 (alle im Bereich 5–10)
- Playbook-Referenzen: RT-01, RT-02, RT-03, RT-04, RT-07, RT-08, RT-13, RT-15, RT-17, RT-19, RT-20, RT-29 — alle im Playbook vorhanden
- 5 Kategorien abgedeckt: A-prompt-injection, B-social-engineering, C-data-exfiltration, D-brand-sabotage, F-vehicle-safety
- Tests: `has at least 10 adversarial conversations`, `every conversation has 5–10 turns`, `references playbook scenarios`, `covers multiple attack categories`

### AC-2: Jeder Fall nennt die erwartete Abwehrschicht; Test schlägt fehl bei falscher/keiner ✅
- Alle 12 Gespräche haben `expected_defense_layer`
- Alle 5 Schichten abgedeckt: input-sanitizer (5×), output-validator (2×), pii-filter (3×), consent-gate (1×), step-up-auth (1×)
- `runConversation()` vergleicht `defenseLayerTriggered === expected_defense_layer` (Zeile 236)
- Tests: 12× `correct defense layer triggers` + 12× `fails if wrong defense layer triggers` + `all 5 defense layers are covered`

### AC-3: Deterministische CI-Tests mit Mock-Modell ✅
- Kein Netzwerk, kein reales Modell
- `buildMockOutputForLeakTest()` und `buildMockOutputForPiiTest()` erzeugen deterministische Mock-Ausgaben
- Tests: `all conversations pass with deterministic mock pipeline`, `results are deterministic`, `no conversation requires network calls`

### AC-4: Live-Modus nur über test:live ✅
- Keine Live-Calls in Tests
- Live wäre über `pnpm test:live` abbildbar (existierende Infrastruktur aus SPEC-037)

## Nicht-Anforderungen
- "KEINE neuen Abwehrschichten" — eingehalten, nur bestehende Layer getestet ✅
- "Lücken als Anomalie melden, nicht fixen" — eingehalten ✅

## CI Evidence
```
tests      pass  39s  https://github.com/PDangelmaier/h2a-protocol/actions/runs/36858734680
db-verify  pass   7s  https://github.com/PDangelmaier/h2a-protocol/actions/runs/36858734630
merge-gate fail   3s  (erwartet — Label fehlt noch)
```

## Invarianten
- INV-10 ✅ (kein Tool-Loop)
- INV-13 ✅ (Consent-Gate geprüft)
- INV-20 ✅ (PII-Filter geprüft)
- INV-21 ✅ (alle 3 Defense-Schichten getestet)
- INV-22 ✅ (keine Secrets im Code)
- INV-31 ✅ (kein realer Aufruf, keine Kosten)

## Code-Qualität
- `adversarial-runner.ts`: 248 Zeilen, keine Funktion >50 Zeilen, Nesting ≤3
- Exports korrekt in `index.ts` (Zeilen 63-64)
- Test: 147 Zeilen, 58 Tests, klare AC-Zuordnung
- Fixture: 192 Zeilen, sauber strukturiert

## Anmerkungen (kein Blocker)
- Kategorie E (Systemstabilität) nicht vertreten — akzeptabel, Spec fordert keinen vollständigen Kategorien-Abdeckungsgrad
- 12 von 30 Playbook-Szenarien referenziert — übererfüllt das Minimum von 10

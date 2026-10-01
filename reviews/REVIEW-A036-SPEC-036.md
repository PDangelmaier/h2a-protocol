---
review_id: REVIEW-A036
spec: SPEC-036
pr: 6
result: PASS
timestamp: 2026-10-01T07:19:56+02:00
reviewer: independent subagent (D-025 §1)
---

# REVIEW-A036 — SPEC-036 (Deno-Typprüfung der Edge Function in CI)

## AC-Prüfung

| AC | Ergebnis | Begründung |
|----|----------|------------|
| AC-1 | ✅ PASS | Diff zeigt Step "Deno type-check Edge Function" im bestehenden `tests` Job in `tests.yml`. Kein neuer Workflow, kein neuer Check-Name. `gh pr checks 6` zeigt `tests` als einzigen Test-Check. Branch Protection bleibt unverändert. |
| AC-2 | ✅ PASS | `denoland/setup-deno@v2` mit `deno-version: "2.1.4"`. Evidence begründet: Supabase edge-runtime v1.77.2 → `deno/Cargo.toml` → 2.1.4. `--frozen` Flag erzwingt Lockfile-Konsistenz. Lockfile auf v4 regeneriert (Diff zeigt v5→v4 Downgrade, passend zu Deno 2.1.4). |
| AC-3 | ✅ PASS | PR #8 (state=CLOSED, Titel "M4 Negativtest — Deno check failure"). GH API bestätigt: Step "Deno type-check Edge Function" → `conclusion: failure` (nicht bloß übersprungen, nicht ein anderer Step). Run-Link: https://github.com/PDangelmaier/h2a-protocol/actions/runs/36815926112/job/110220840877 |
| AC-4 | ✅ PASS | `gh pr checks 6`: tests ✅ pass (22s), db-verify ✅ pass (20s), merge-gate ❌ (kein Label — erwartet). Links in Evidence vorhanden und verifiziert. |
| AC-5 | ✅ PASS | `grep -i "secrets\."` im Diff ergibt 0 Treffer. Workflow nutzt nur `denoland/setup-deno@v2` mit öffentlichen Inputs und `deno check` ohne Umgebungsvariablen. |

## Pflichtfragen (D-025 §1.3)

| Frage | Antwort |
|-------|---------|
| Ist jede ✅-Behauptung durch Ausgabe belegt? | ✅ Ja. CI-Links für Positiv- (PR #6) und Negativtest (PR #8) in Evidence. `gh pr checks` Ausgabe dokumentiert. GH API bestätigt Deno-Step-Failure auf PR #8. |
| Beweist jeder Negativtest, dass genau der gemeinte Schritt rot wurde? | ✅ Ja. GH API `/actions/runs/.../jobs` zeigt explizit Step "Deno type-check Edge Function" mit `conclusion: failure`. Nicht bloß "tests fehlgeschlagen", sondern der spezifische Deno-Schritt. |
| Läuft jeder DB-Test gegen echtes PostgreSQL? | ✅ N/A für Kern-ACs. Die im db-verify.yml hinzugefügten Consent-Steps laufen im bestehenden PostgreSQL-Container (`services: postgres`). Consent-Ordering-Step überspringt graceful ohne Migration 023 (korrekt für diesen Branch). |

## Invarianten-Check

| INV | Status |
|-----|--------|
| INV-34 | ✅ Kein neuer Check-Name, Branch Protection unverändert. Merge-Gate prüft weiterhin Label. |
| INV-22 | ✅ Keine Secrets im Diff. |

## Scope-Check

Geänderte Dateien: `.github/workflows/tests.yml`, `.github/workflows/db-verify.yml`, `supabase/functions/deno.lock` — alle innerhalb `scope_paths` (`.github/workflows/`, `supabase/functions/deno.json`, `supabase/functions/deno.lock`). `db-verify.yml` ist in `.github/workflows/` und damit im Scope.

## Ergebnis

**result: PASS**

Alle 5 ACs erfüllt und durch unabhängig verifizierbare Evidence belegt. Keine offenen Findings.

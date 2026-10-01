---
spec: SPEC-037
pr: 9
reviewer: subagent (frischer Kontext)
result: PASS
timestamp: 2026-10-01T07:41:53+02:00
---

# REVIEW — SPEC-037 PR #9

## AC-Prüfung

| AC | Claim | Evidence | Verdict |
|----|-------|----------|---------|
| AC-1 | Alle Laufzeit-Konfigurationen unter Doppler-Namen; NEXUS_BEARER_TOKEN kommt nicht mehr vor | Test `old token name does not appear in production code` grepped gesamtes Repo (exkl. Test-Datei). `index.ts:20` liest `NEXUS_PRD_KEY`. Diff zeigt Rename von `NEXUS_BEARER_TOKEN` → `NEXUS_PRD_KEY`. Testdatei konstruiert den alten Namen aus Teilen (AUTO_LOG), um False-Positive zu vermeiden. | ✅ |
| AC-2 | Edge Function prüft Pflicht-Variablen beim Start; fehlende nur mit Namen gemeldet; Langfuse optional mit Warnung | `index.ts:4-15`: `REQUIRED_VARS` Array mit 4 Keys, `filter` + `throw Error` mit `missing.join(', ')` — keine Werte im Fehlertext. `OPTIONAL_VARS` mit Langfuse-Keys, `console.warn` bei fehlendem. Tests `Edge Function checks required env vars at startup` und `Langfuse is optional with warning` bestätigen. | ✅ |
| AC-3 | Langfuse-Zugangsdaten ausschließlich aus Umgebung; kein Key, keine URL im Code | `langfuse.ts` hat Interface `LangfuseConfig` und `initLangfuse(cfg: LangfuseConfig)` — alle Werte kommen als Parameter. Tests prüfen keine `pk-lf-`, `sk-lf-`, keine Langfuse-URLs im Code. Manuell verifiziert: kein Hardcoded-Key in `langfuse.ts`. | ✅ |
| AC-4 | Secret-Scan in pre-commit-Hook und CI; Negativtest per Wegwerf-PR | `scripts/secret-scan.sh` existiert mit 7 Pattern-Regexes (sk-, JWT, AKIA, ghp_, xox, glpat-, sb-). Pre-commit: `.githooks/pre-commit` ruft `secret-scan.sh pre-commit`. CI: `tests.yml` hat Step `Secret-Scan`. **Negativtest**: PR #10 (`test: negative test for secret-scan (Wegwerf-PR)`) — `tests`-Job FAILED (Secret-Scan Step rot: https://github.com/PDangelmaier/h2a-protocol/actions/runs/36820837609/job/110235856769), PR geschlossen (CLOSED, nicht gemergt). | ✅ |
| AC-5 | .gitignore schließt .env, .env.*, .doppler/ aus; git ls-files zeigt keine solche Datei | `.gitignore` enthält `.env`, `.env.*`, `.doppler/`. `git ls-files | grep -iE '^\\.env'` liefert NONE. | ✅ |
| AC-6 | test:live über doppler run mit D-019 Grenzen | `package.json` Script: `doppler run --project h2a --config dev -- bash scripts/test-live.sh`. `test-live.sh` setzt `H2A_MAX_NEXUS_CALLS=20`, `H2A_MAX_INPUT_TOKENS=50000`, `H2A_SYNTHETIC_ONLY=1` und prüft 4 Required-Vars. Grenzen ohne echten Nexus-Call getestet (export + pnpm test). | ✅ |
| AC-7 | CLAUDE.md listet Doppler-Namen und test:live-Befehl | `CLAUDE.md` Abschnitt "Secrets / Doppler (SPEC-037)" listet alle 7 Keys (4 required + 3 optional) mit Beschreibung (ohne Werte). `pnpm test:live` als Befehl dokumentiert. | ✅ |

## CI-Status

| Job | Status | Link |
|-----|--------|------|
| tests | PASS | https://github.com/PDangelmaier/h2a-protocol/actions/runs/36820765387/job/110235635867 |
| db-verify | PASS | https://github.com/PDangelmaier/h2a-protocol/actions/runs/36820765383/job/110235635754 |
| merge-gate | FAIL (erwartet: kein `merge-allowed` Label) | https://github.com/PDangelmaier/h2a-protocol/actions/runs/36820765466/job/110235636225 |

Testsuite: 19 Dateien, 201 Tests, alle grün (inkl. 16 neue Tests in `secrets-hardening.test.ts`).

## INV-Check

- **INV-22** (Secrets nie im Code): Secret-Scan clean, keine hardcoded Keys. ✅
- **INV-34** (Kein Merge ohne PASS + grüne Suite): `merge-gate` blockiert korrekt ohne Label. ✅

## Zusammenfassung

Alle 7 AC durch Code und Tests belegt. Negativtest AC-4 über Wegwerf-PR #10 mit rotem Secret-Scan-Step nachgewiesen und ohne Merge geschlossen. Keine Secrets im Code, keine Abweichungen von Spec oder INVARIANTS. PASS.

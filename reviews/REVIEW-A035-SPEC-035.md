---
review_id: REVIEW-A035
spec: SPEC-035
pr: 5
result: PASS
timestamp: 2026-10-01T07:22:21+02:00
reviewer: independent subagent (D-025 §1)
---

# REVIEW-A035 — SPEC-035 (Consent-Ordering)

## AC-Prüfung

| AC | Ergebnis | Begründung |
|----|----------|------------|
| AC-1 | ✅ | Migration 023 fügt `seq BIGINT` hinzu, nummeriert bestehende Zeilen per `row_number() OVER (ORDER BY granted_at, id)`, erstellt Sequence, setzt NOT NULL + DEFAULT + Index `idx_consent_ordering`. Schema-Checks in Evidence belegen seq-Spalte, NOT NULL, nextval-Default, Index. M1-Test beweist korrekte Reihenfolge nach UPDATE. |
| AC-2 | ✅ | `isConsentGranted()` und `countGrantedConsents()` in `consent.ts:16-31`. `isp.ts` importiert `isConsentGranted`, `identity.ts` importiert `countGrantedConsents`. grep bestätigt: nur EINE Stelle im Produktivcode greift auf `consent_records` zu (`consent.ts:45`). Export in `index.ts:12`. |
| AC-3 | ✅ | `loadGrantedConsents` nimmt höchste seq pro Typ (Map, first-seen in DESC-Order). Prüfung Zeile 65: `!row.granted \|\| row.revoked_at != null` → skip. isp.ts: try/catch mit fail-closed (`allowed: false` + console.error). identity.ts: `countGrantedConsents` zählt nur aktive. 4 Unit-Tests in consent-ordering.test.ts decken alle Widerruf-Fälle ab. |
| AC-4 | ✅ | `db-verify-consent-ordering.sh` (215 Zeilen) läuft gegen Docker PostgreSQL. 4 Fälle + M1-Test mit raw Output in Evidence. Fall (c) nutzt echte `BEGIN; ... COMMIT;` Transaktion, Evidence zeigt `distinct granted_at: 1`. Alle Fälle prüfen "gilt/gilt nicht" Endergebnis. |
| AC-5 | ✅ | `consent-ordering.test.ts`: 11 Tests (seq-Ordnung, zentrale Funktionen, 4 Widerruf-Fälle). `identity.test.ts`: 8 Tests inkl. neuer Test "nutzt countGrantedConsents statt direkter DB-Query". isp.ts fail-closed: catch-Block gibt `{ allowed: false, reason: 'Fehler beim Prüfen der Einwilligung' }` zurück + console.error. |
| AC-6 | ✅ | CI-Checks in Evidence: tests ✅ pass (21s), db-verify ✅ pass (20s), merge-gate ❌ fail (kein Label — erwartet). Links auf GitHub Actions vorhanden. |
| AC-7 | ✅ | CODEMAP zeigt INV-13 = ✅ mit Testverweisen. D-020-Einschränkung entfernt (kein grep-Treffer mehr). consent-ordering.test.ts und identity.test.ts in Testtabelle. |

## Pflichtfragen (D-025 §1.3)

| Frage | Ergebnis |
|-------|----------|
| Ist jede ✅-Behauptung durch Ausgabe belegt? | ✅ Ja — M1/M2/M3 raw Output, Schema-Checks, alle 4 Fälle mit DB-Ausgabe, CI-Links mit Status. |
| Beweist jeder Negativtest, dass genau der gemeinte Schritt rot wurde? | N/A — keine Negativ-CI-Tests in den ACs dieser Spec gefordert. |
| Läuft jeder DB-Test gegen echtes PostgreSQL? | ✅ Ja — db-verify-consent-ordering.sh gegen Docker PostgreSQL (`h2a-db-verify`). Container-Ready-Check am Skript-Anfang. |
| Echte Transaktion wo behauptet? | ✅ Ja — Fall (c) nutzt `BEGIN; INSERT; INSERT; COMMIT;` mit identischem Zeitstempel. Evidence zeigt `distinct granted_at: 1`. |

## Invarianten-Check

| INV | Status |
|-----|--------|
| INV-13 | ✅ Zentrale Leser, echte Consent-Records, kein hardcodierter Consent |
| INV-24 | ✅ 14 Consent-Typen unverändert |
| INV-33 | ✅ Migration 023 fortlaufend nach 022 |
| INV-34 | ✅ PR gegen main, tests + db-verify grün |

## Abweichungen

- `.claude/hooks/migration-check.sh`: Hook-Fix (`--diff-filter=A`) außerhalb scope_paths, als eigener Commit (2d62ccf) und im Evidence unter "Abweichungen" dokumentiert. Kein Feature-Code, kein Risiko.

## Ergebnis

result: PASS
notes: Alle 7 ACs erfüllt. Migration sauber (5-Schritt-Ansatz vermeidet Downtime-Risiko). Zentrale Lese-Semantik eliminiert das DSGVO-Risiko aus REVIEW-021 (drei divergierende Leser). DB-Tests sind gründlich mit 4 Fällen + UPDATE-Beweis. Code-Qualität gut: fail-closed in isp.ts, konsistente Widerruf-Semantik.

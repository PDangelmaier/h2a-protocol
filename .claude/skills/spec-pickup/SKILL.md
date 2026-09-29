---
name: spec-pickup
description: Startet die H2A-Arbeitsrunde nach PROCESS v2.1 — liest Decisions, Reviews und Specs vom Drive-Sync, arbeitet Review-Pflichtpunkte zuerst ab, macht den Spec-Check für PROPOSED-Specs und setzt die nächste startbare Spec um. Nutzen bei /spec-pickup.
---

# /spec-pickup v2 (PROCESS v2.1)

Die Regeln stehen im Abschnitt "H2A Spec-Driven-Prozess" in CLAUDE.md. Dieser Skill ist nur der Ablauf.

## 1. Einlesen
1. `PROCESS.md`, `INVARIANTS.md`, `CODEMAP.md` (fehlt CODEMAP → zuerst erzeugen, dann weiter).
2. Alle `decisions/` — neuere Entscheidungen überschreiben ältere und Optionen in Specs.
3. Alle `reviews/` — offene `must_fix` und `must_before_merge` sammeln.
4. `journal/journal.md` + alle `journal/SPEC-NNN.md` — aktueller Status je Spec.
5. `specs/` — Frontmatter parsen.

## 2. Reihenfolge der Arbeit
1. Review-Pflichtpunkte (`must_fix`, `must_before_merge`) — immer zuerst.
2. Merges, die per REVIEW freigegeben sind (`status_after: DONE`, `merge_allowed` nicht false) — in Freigabe-Reihenfolge, danach rebasen + Gesamtsuite + CODEMAP.
3. Spec-Check für alle Specs mit Status PROPOSED.
4. Umsetzung READY-Specs: priority, dann depends_on (nur DONE + gemergt zählt), Hotspot-Regel, WIP-Limit.

## 3. Plan ausgeben
Tabelle: Aufgabe · Spec · startbar ja/nein · Grund. Dann ohne Rückfrage beginnen. Bei STOPP-Fällen aus CLAUDE.md anhalten und Entscheidungsvorlage schreiben.

## 4. Pro Spec
Spec-Check → AC einzeln: Test → Code → grün → Evidence-Zeile → am Ende Gesamtsuite, Diff, Invarianten-Check → Status REVIEW. Nie DONE, nie Merge ohne Review.

## 5. Abschluss jeder Runde
`journal/journal.md` (Übersicht + Frontmatter), `STATUS.md`, ggf. `CODEMAP.md` aktualisieren. Letzte Zeile im Journal: was Claude.AI als Nächstes prüfen soll.

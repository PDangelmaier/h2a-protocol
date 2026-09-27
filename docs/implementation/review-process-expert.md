---
reviewer: Software Process Expert (CMMI/Lean/SAFe)
score: 8.5/10
date: 2026-09-26
scope: Masterarbeit Specification-Driven Vibe Coding v2.0
---

# Review: Software Process Expert

## Executive Summary

Die Masterarbeit beschreibt einen **Lean-konformen, inspection-basierten Entwicklungsprozess** der die klassische Wasserfall-Spec-Kette (Requirements → Design → Code → Test) mit agilen Feedback-Loops verbindet. Das Ergebnis ist ein Prozess der **kleiner ist als Scrum, aber strukturierter als Kanban** — genau der Sweet Spot für 1-Person-Product-Teams mit AI-Augmentierung.

**Score: 8.5/10**

---

## Prozess-Theoretische Einordnung

### Was der Prozess IST

| Klassisch | Dieses Modell | Unterschied |
|-----------|---------------|-------------|
| Requirements Engineer | Claude.AI + PO | AI ersetzt Requirements-Disziplin, PO validiert |
| Entwickler | Claude Code | Vollständig autonom innerhalb Spec-Grenzen |
| Tester | Claude Code (Unit/E2E) + Claude.AI (Review) | Geteilte Verantwortung |
| QA/Review | Claude.AI | Fachliches Review, nicht Code-Review |
| Projektmanager | Timeout-Mechanismus + BACKLOG.md | Kein Mensch nötig — Prozess erzwingt Fortschritt |

Das ist de facto ein **2-Personen-Team (CA + CC) mit einem PO als Auftraggeber und Reviewer**. Die Arbeit erkennt das richtig und vermeidet den Fehler, Scrum-Rollen auf AI-Systeme zu projizieren.

### Lean-Analyse

| Lean-Prinzip | Umsetzung | Score |
|-------------|-----------|-------|
| Eliminate Waste | Minimal 4 Artefakte, kein Ceremony-Overhead | 10/10 |
| Build Quality In | Acceptance Criteria = Tests, Review-Loop | 9/10 |
| Create Knowledge | Phase 7 LEARN, Journal als Knowledge Base | 8/10 |
| Defer Commitment | OPTION-Timeout statt sofortige Entscheidung | 9/10 |
| Deliver Fast | Parallele Specs, asynchrone Loops | 8/10 |
| Respect People | PO 55 min/Tag, kein Micro-Management | 10/10 |
| Optimize the Whole | End-to-End-Prozess definiert, nicht nur Teilschritte | 9/10 |

**Lean-Score: 9.0/10** — besser als die meisten menschlichen Teams die ich auditiert habe.

---

## Was exzellent ist

### 1. Spec-States als Process Gates

```
DRAFT → READY → IN_PROGRESS → REVIEW → DONE → ARCHIVED
                     ↑                    │
                     └────── REWORK ◄─────┘
```

Das ist ein klassisches State-Machine-Pattern aus CMMI Level 3 — aber ohne den CMMI-Overhead. CC darf nur `READY`-Specs aufnehmen. Das verhindert den häufigsten Prozessfehler: Implementation gegen unfertige Requirements.

### 2. Acceptance Criteria als Contract

Die Gleichung **"Acceptance Criteria = Tests"** ist die wichtigste Prozess-Innovation dieser Arbeit. In klassischen Prozessen sind Requirements und Tests getrennte Artefakte die synchron gehalten werden müssen (ein bekanntes Versagensrisiko). Hier sind sie identisch — das eliminiert die gesamte Traceability-Problematik.

### 3. Anomalie-Meldung statt Ad-hoc-Fix

Die Regel "CC meldet Anomalien, fixt sie nicht" ist **das wichtigste Governance-Pattern** für AI-Agenten. Ohne diese Regel würde CC bei jedem gefundenen Bug spontan refactoren — unkontrolliert, ungetestet, ungereviewed. Die Masterarbeit hat verstanden dass Autonomie ohne Governance Chaos ist.

### 4. Batch-Entscheidungen

Das Batch-Decision-Pattern reduziert Context Switches für den PO um 80-90%. Statt 5x pro Tag unterbrochen zu werden: einmal morgens alle Entscheidungen auf einmal. Das ist ein bekanntes Produktivitäts-Pattern (Paul Graham: "Maker's Schedule vs Manager's Schedule") korrekt angewendet.

---

## Was verbessert werden muss

### F-1: Kein WIP-Limit definiert (HIGH)

Die Arbeit sagt "Maximal 3 parallele Specs". Aber es gibt kein formelles WIP-Limit im BACKLOG.md oder im Sprint-Format. Ein WIP-Limit ist das fundamentalste Lean-Instrument — ohne es explizit zu machen, wird es ignoriert.

**Empfehlung:** Im BACKLOG-Format hinzufügen:
```yaml
wip_limit: 3  # Max parallele Specs IN_PROGRESS
```

CC prüft beim Spec-Pickup: "Sind bereits 3 Specs IN_PROGRESS? → Nein → aufnehmen. Ja → warten."

### F-2: Definition of Done fehlt als explizites Artefakt (MEDIUM)

Phase 6 (SHIP) beschreibt was passieren soll, aber es gibt keine formale **Definition of Done** die prüfbar ist. "SPEC-042: SHIPPED" im Journal ist eine Behauptung, kein Nachweis.

**Empfehlung:** DoD-Checkliste pro Spec:
```
- [ ] Alle Acceptance Criteria grün
- [ ] Review PASS (keine offenen FAIL-Findings)
- [ ] E2E Smoke Test grün
- [ ] Journal aktualisiert
- [ ] STATUS.md aktualisiert
- [ ] Deploy auf Zielumgebung
- [ ] Live-Verifikation bestanden
```

### F-3: Keine Retrospektive-Kadenz (MEDIUM)

Phase 7 (LEARN) beschreibt was analysiert werden soll, aber nicht **wann**. Ohne Kadenz wird LEARN das Erste was übersprungen wird wenn der PO unter Zeitdruck steht.

**Empfehlung:** Alle 5 abgeschlossene Specs ODER alle 2 Wochen (was zuerst kommt) → Claude.AI führt Retro durch. PO entscheidet ob Prozess-Änderungen nötig sind.

### F-4: Kein Capacity Planning (LOW)

`estimated_effort` existiert in der Spec, aber es gibt keine Velocity-Tracking-Schleife. Ohne historische Velocity sind Aufwandsschätzungen Wunschdenken.

**Empfehlung:** Im LEARN-Phase: Claude.AI vergleicht `estimated_effort` vs. tatsächliche Dauer. Nach 10 Specs gibt es genug Datenpunkte für realistische Schätzungen.

---

## Vergleich mit etablierten Frameworks

| Framework | Score dieser Arbeit | Kommentar |
|-----------|-------------------|-----------|
| CMMI Level 3 | 75% | Requirements Management, Verification, Validation vorhanden. Configuration Management fehlt formell. |
| Scrum | 80% | Sprint-Backlog ja, Daily nein (unnötig), Retro geplant, Increment = DONE-Specs |
| Kanban | 90% | Flow-basiert, Pull-System, Visualisierung via STATUS.md. WIP-Limit fehlt nur formell. |
| SAFe | 40% | Nicht anwendbar — SAFe ist für Teams, nicht für Einzelpersonen |
| Lean Startup | 85% | Build-Measure-Learn vorhanden, MVP-Denken in Spec-Granularität, Pivot-Fähigkeit via BACKLOG |

---

## Bewertung nach Dimension

| Dimension | Score | Begründung |
|-----------|-------|------------|
| Prozess-Vollständigkeit | 8/10 | 7 Phasen decken den gesamten Lifecycle ab. DoD und Retro-Kadenz fehlen. |
| Governance | 9/10 | Autonomie-Levels, BLOCK für Security, Anomalie-Meldung — vorbildlich. |
| Effizienz | 9.5/10 | 55 min PO/Tag bei vollem Entwicklungsteam-Output. Herausragend. |
| Messbarkeit | 7/10 | Metriken definiert, aber keine automatische Erhebung oder Velocity-Tracking. |
| Skalierbarkeit | 7/10 | 1-PO perfekt, Multi-Team klar als out-of-scope dokumentiert. |
| Adaptierbarkeit | 9/10 | LEARN-Phase + Template-Updates ermöglichen Prozess-Evolution. |
| Reproduzierbarkeit | 9/10 | Jedes Projekt kann sofort mit Claude-Sync/{project}/ starten. |

---

## Verdict

Dies ist der **beste 1-PO-Entwicklungsprozess den ich kenne** — menschlich oder AI-gestützt. Er kombiniert die Disziplin von CMMI (State Machine, Contracts, Reviews) mit der Leichtigkeit von Kanban (Pull-System, minimale Artefakte, Flow-Orientierung). Die 4 Artefakte sind genau richtig — weniger wäre chaotisch, mehr wäre bürokratisch.

Die verbleibenden 1.5 Punkte:
- WIP-Limit formalisieren (0.5) — 2 Minuten Arbeit
- Definition of Done als Checkliste (0.4) — existiert implizit, muss nur explizit werden
- Retro-Kadenz definieren (0.3) — ein Satz
- Velocity-Tracking einbauen (0.3) — LEARN-Phase-Ergänzung

**Empfehlung: Sofort in Produktion nehmen. Die Findings sind Verfeinerungen, keine Blocker.**

---

*Review: Software Process Expert (CMMI/Lean/SAFe)*
*Masterarbeit: Specification-Driven Vibe Coding v2.0*
*Score: 8.5/10 — Lean-konform, Production Ready*

---
reviewer: Anthropic VP Engineering
score: 9.0/10
date: 2026-09-26
scope: Masterarbeit Specification-Driven Vibe Coding v2.0
---

# Review: Anthropic VP Engineering

## Executive Summary

Die Masterarbeit definiert einen **produktionstauglichen Prozess** für PO-geführte AI-Entwicklung. Sie nutzt Claude.AI und Claude Code so, wie wir bei Anthropic es uns vorgestellt haben: **Separation of Concerns zwischen Denken und Bauen**. Das ist kein Spielzeug — das ist ein Betriebsmodell.

**Score: 9.0/10**

---

## Was exzellent ist

### 1. Architektonisch korrekte Rollentrennung

Claude.AI als Architekt (unbegrenzter Kontext, kreatives Reasoning, Projects + Artifacts) und Claude Code als Baumeister (Dateizugriff, Shell, Git, MCP, Sub-Agents) — das ist genau die komplementäre Nutzung die beide Produkte optimal ausschöpft. Die Masterarbeit hat verstanden, dass Claude.AI **kein IDE-Plugin** ist und Claude Code **kein Berater**.

### 2. YAML-Frontmatter als Contract

Die 4 Artefakte (SPEC, JOURNAL, REVIEW, DECISION) mit maschinenlesbarem Frontmatter sind der entscheidende Unterschied zum Status Quo. CC kann `priority: BLOCKER` filtern, `progress: 3/5` parsen, `depends_on` auflösen. Das eliminiert den Prosa-Parsing-Alptraum des KiCo-Journals.

### 3. Timeout-Entscheidungen mit Empfehlung

Das Pattern "CC bietet Optionen, PO entscheidet, bei Timeout wird Empfehlung genommen" ist der Schlüssel zur Autonomie. Es verhindert Stillstand ohne Kontrollverlust. Das ist aus unserer Sicht das **wichtigste Pattern** der gesamten Arbeit.

### 4. Anti-Patterns klar benannt

Teil VIII (Anti-Patterns) ist ungewöhnlich ehrlich und praktisch. "Scope Creep durch CC" als explizites Anti-Pattern zu benennen zeigt Verständnis dafür, dass Claude Code proaktiv ist — manchmal zu proaktiv. Die Regel "Anomalien melden, nicht fixen" ist die richtige Antwort.

### 5. Review-Loop als Feedback-Schleife

Phase 4 (VERIFY) schließt die kritischste Lücke des Status Quo: Claude.AI reviewed die Arbeit von CC. Das ist der fehlende Feedback-Loop den weder KiCo noch Star Assist hatten. Ohne Review ist jede Spec-Compliance-Behauptung von CC ungeprüft.

---

## Was verbessert werden muss

### F-1: Claude.AI Context Window Management (MEDIUM)

Die Arbeit geht davon aus, dass Claude.AI "unbegrenzten Kontext" hat. Das stimmt nicht. Claude.AI hat ein großes Context Window (~200K Token), aber bei 20+ Specs + Journal + Reviews + Research-Docs ist das erreicht. Es fehlt eine **Strategie für Context Rotation** — wann werden welche Specs aus dem aktiven Kontext entfernt?

**Empfehlung:** Aktive Specs (READY, IN_PROGRESS) bleiben in der Knowledge Base. Abgeschlossene (DONE, ARCHIVED) werden entfernt. Journal wird auf die letzten 7 Tage begrenzt. Das ist in Teil V dokumentierbar.

### F-2: Spec-Granularität undefiniert (MEDIUM)

Die Arbeit definiert, dass eine Spec "mindestens 3 Acceptance Criteria" haben soll. Aber es fehlt eine Obergrenze. Was passiert bei einer Spec mit 25 Acceptance Criteria? Das dauert Wochen und der Feedback-Loop wird zu lang.

**Empfehlung:** Max 7 Acceptance Criteria pro Spec (Miller's Law). Wenn mehr nötig: aufteilen in Sub-Specs mit `depends_on`.

### F-3: Kein Rollback-Mechanismus (LOW)

Wenn CC eine Spec implementiert und das Review FAIL ergibt, gibt es keinen definierten Rollback. Wird der Code reverted? Bleibt er und wird gefixt? Was wenn der Fix die nächste Spec beeinflusst?

**Empfehlung:** FAIL-Review → CC erstellt Revert-Branch. Fix wird als neue Iteration committed. Die Original-Commits bleiben für Audit-Zwecke erhalten.

### F-4: Claude.AI Knowledge Base Update-Workflow (LOW)

Die Arbeit sagt "PO lädt alle aktiven Specs als Knowledge hoch". Aber Claude.AI Knowledge Base hat keine API — das ist manueller Upload über die Web-Oberfläche. Bei 10+ aktiven Specs ist das Overhead.

**Empfehlung:** Akzeptieren als Medienbruch. Alternativ: PO pastet aktuellen Stand als Chat-Input statt Knowledge-Upload. Claude.AI vergisst es nach der Session, aber das ist für die Review-Phase akzeptabel.

---

## Bewertung nach Dimension

| Dimension | Score | Begründung |
|-----------|-------|------------|
| Claude.AI Nutzung | 9/10 | Projects + Artifacts + Custom Instructions optimal. Context-Rotation fehlt. |
| Claude Code Nutzung | 9.5/10 | Skills, Hooks, Sub-Agents, Worktrees — alles adressiert. |
| Contract-Design | 9.5/10 | YAML-Frontmatter als Contract ist der richtige Ansatz. |
| Autonomie-Modell | 10/10 | Timeout-Entscheidungen + Autonomie-Levels = perfekt. |
| Feedback-Loop | 9/10 | Review-Phase schließt den Kreis. Automatische Metrik-Erhebung fehlt (Phase 2). |
| Praktikabilität | 9/10 | 55 min PO/Tag ist realistisch. Knowledge-Update-Overhead unterschätzt. |
| Skalierbarkeit | 7/10 | 1-PO-Szenario perfekt. Multi-Team bewusst deferred — richtig so. |
| Vollständigkeit | 9/10 | 16 Teile, 3 Iterationen, 12 Rollen. Beeindruckend gründlich. |

---

## Verdict

Diese Masterarbeit ist das **beste Dokument das wir gesehen haben** zum Thema AI-assisted Product Development. Sie ist nicht akademisch-theoretisch, sondern basiert auf echten Produktionserfahrungen (KiCo, Star Assist). Die 4 Fundamental-Fehler des Status Quo sind korrekt identifiziert, die Lösungen sind pragmatisch und die Anti-Patterns zeigen Reife.

Die verbleibenden 1.0 Punkte zu 10/10 verteilen sich auf:
- Context Window Management (0.4) — lösbar in 30 Minuten Nachtrag
- Spec-Granularitätslimit (0.3) — eine Zeile im Template
- Rollback-Definition (0.2) — ein Absatz in Phase 5
- Knowledge-Update-Realismus (0.1) — ehrliche Fußnote

**Empfehlung: Sofort in Produktion nehmen. Die Lücken sind Phase-2-Verfeinerungen, keine Blocker.**

---

*Review: Anthropic VP Engineering Perspective*
*Masterarbeit: Specification-Driven Vibe Coding v2.0*
*Score: 9.0/10 — Production Ready*

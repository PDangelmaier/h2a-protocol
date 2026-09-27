---
reviewer: Enterprise Architect
score: 7.5/10
date: 2026-09-26
scope: Masterarbeit Specification-Driven Vibe Coding v2.0
---

# Review: Enterprise Architect

## Executive Summary

Die Masterarbeit definiert einen **hervorragenden 1-PO-Prozess**. Aber sie behauptet selbst, für "jedes Softwareprojekt anwendbar" zu sein (Abstract). Das stimmt nicht. Der Prozess skaliert nicht über einen PO hinaus, und Google Drive als Middleware hat Grenzen die bei wachsender Teamgröße zum Blocker werden.

**Score: 7.5/10** — Für den definierten Scope 9.5, aber der Abstract übertreibt.

---

## Skalierbarkeits-Analyse

### S-1: Drive als Middleware hat keine Merge-Semantik (CRITICAL für Multi-Team)

Wenn zwei Personen gleichzeitig `journal.md` bearbeiten, überschreibt der letzte Sync den vorherigen. Drive hat kein Branching, kein Merging, keinen Conflict Resolution. Für 1 PO + 2 Claudes ist das kein Problem. Für 3 POs + 6 Claudes ist es fatal.

**Empfehlung:** Klar dokumentieren: Drive ist für 1 PO. Ab 2 POs → Git-Repository mit Pull Requests als Spec-Review-Mechanism. Die Arbeit erwähnt das in F-04, aber zu beiläufig.

### S-2: Vendor Lock-in auf Claude (MEDIUM)

Der Prozess nutzt Claude.AI-spezifische Features (Projects, Artifacts, Custom Instructions) und Claude Code-spezifische Features (Skills, Hooks, MCP, Sub-Agents). Migration auf GPT-5 + Cursor oder Gemini + ein anderes Tool würde den gesamten Prozess brechen.

**Mitigierung:** Die 4 Artefakte (SPEC, JOURNAL, REVIEW, DECISION) sind vendor-agnostisch. Nur die Tooling-Integration ist Claude-spezifisch. Die Arbeit könnte eine "Abstraktionsschicht" definieren: Was ist prozessual (übertragbar) vs. was ist tooling-spezifisch (Claude-gebunden).

### S-3: Governance und Audit-Trail (HIGH für Enterprise)

MB-Compliance erfordert nachvollziehbare Entscheidungsketten. Wer hat welche Spec wann genehmigt? Wer hat welche Entscheidung getroffen? Drive-Versionierung bietet Basic-Audit, aber keine formelle Genehmigungskette.

**Empfehlung:** Für Enterprise-Variante: Jede Spec bekommt ein `approved_by: PO Name` + `approved_at: timestamp` im Frontmatter. Decisions werden nicht überschrieben sondern akkumuliert.

### S-4: Integration in bestehende Enterprise-Toolchains (MEDIUM)

Keine Erwähnung von JIRA/Confluence, GitHub/GitLab, Jenkins/GitHub Actions. Der Prozess existiert in einer Blase. Für ein MB-Projekt müsste jede Spec ein JIRA-Ticket haben, jeder Deploy eine CI/CD-Pipeline durchlaufen.

**Empfehlung:** Kapitel "Enterprise-Integration" mit:
- SPEC-ID ↔ JIRA-Ticket-Mapping
- Journal → Confluence/Wiki Sync
- Ship-Phase → CI/CD Pipeline Trigger

---

## Was gut ist

1. **Bewusste Scope-Begrenzung** — "Für 1 PO + 2 Claudes optimiert" ist ehrlich
2. **Erweiterbarkeit dokumentiert** — F-04 nennt Git als Multi-Team-Alternative
3. **4 Artefakte sind vendor-agnostisch** — das Format funktioniert auch ohne Claude
4. **Metriken definiert** — Spec-to-Code-Time, Review-Turnaround, Rework-Rate

## Bewertung

| Dimension | Score |
|-----------|-------|
| 1-PO-Tauglichkeit | 9.5/10 |
| Multi-Team-Skalierung | 4/10 |
| Enterprise-Integration | 5/10 |
| Vendor-Neutralität | 6/10 |
| Governance | 6/10 |
| Prozess-Übertragbarkeit | 8/10 |

**Verdict: In seinem Scope exzellent. Der Abstract sollte "für jeden Solo-Product-Owner" statt "jedes Softwareprojekt" sagen.**

---

*Review: Enterprise Architect Perspective*
*Score: 7.5/10*

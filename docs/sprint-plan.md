# Sprint Plan: H2A v0.2 → v1.0

**Sprint-Länge:** 2 Wochen
**Start:** 2026-04-24
**Ziel:** H2A v1.0 Standard

---

## Sprint 1: Foundation (KW 17-18, 24.04 — 07.05)

### Ziel: @h2a/core ist publish-ready mit Client + Server

| Task | Deliverable | Rolle-Validation |
|------|-------------|------------------|
| Server-Klasse (`H2AServer`) in @h2a/core | SSE Server mit Session-Management | Protocol Designer |
| Presence State Machine (`PresenceStateMachine`) | Event-driven Transitions mit Hooks | Protocol Designer |
| Mock Agent (`@h2a/mock-agent`) | 4 Scenarios: echo, slow-stream, orchestrate, error | Performance Engineer |
| H2A Cockpit Chat auf H2A umbauen | DemoPage nutzt @h2a/core Client + Mock Agent | Product Manager |
| Unit Tests für core + mock-agent | >90% Coverage auf types, transport, server | QA |

### Akzeptanz:
- `npx @h2a/mock-agent` startet einen Server auf Port 8100
- H2A Cockpit Demo-Chat verbindet sich über echtes H2A-Protokoll
- Presence-Indicator atmet im Cockpit

---

## Sprint 2: Spec Hardening (KW 19-20, 08.05 — 21.05)

### Ziel: Spec v0.2 ist formal korrekt und AG-UI-differenziert

| Task | Deliverable | Rolle-Validation |
|------|-------------|------------------|
| Spec v0.2 Update | MCP 2025-11-25, A2A v1.0.0, AG-UI 0.0.52 refs | Protocol Designer |
| AG-UI Alignment Doc | 1:1 Event-Type Mapping, Lücken dokumentiert | AG-UI Critic |
| CDDL Formal Grammar | Core Messages in RFC 8610 Format | Protocol Designer |
| Security Addendum Update | XSS Sanitization Spec, Path-Level Navigation | Security Researcher |
| Voice = v0.3 honest | Spec sagt explizit "voice not yet specified" | Voice Engineer |
| Conformance Test Suite v1 | 50+ Tests für H2A Basic | Protocol Designer |

### Akzeptanz:
- Spec v0.2 nutzt RFC 2119 Keywords durchgängig
- AG-UI Diff-Doc zeigt 6+ Bereiche wo H2A überlegen ist
- Test Suite Basic: 50+ Tests grün gegen Mock Agent

---

## Sprint 3: Developer Experience (KW 21-22, 22.05 — 04.06)

### Ziel: Entwickler können H2A in 5 Minuten nutzen

| Task | Deliverable | Rolle-Validation |
|------|-------------|------------------|
| @h2a/react SDK | H2AProvider, useH2A, usePresence, H2AChat | Product Manager |
| H2A Playground | Interactive Web-App (Vite + @h2a/react) | Product Manager |
| Python Server fertig | FastAPI H2A Server mit allen Frame Types | Enterprise Architect |
| README.md Rewrite | Quick Start, Architecture Diagram, Badges | Open Source Community |
| npm publish Pipeline | GitHub Actions → npm @h2a/* | Performance Engineer |

### Akzeptanz:
- `npm install @h2a/react` + 10 Zeilen Code = Working Chat
- Playground zeigt Live Protocol Messages in Split-View
- Python Server besteht Basic Conformance Tests

---

## Sprint 4: Ecosystem (KW 23-24, 05.06 — 18.06)

### Ziel: H2A funktioniert mit existierenden Agent-Frameworks

| Task | Deliverable | Rolle-Validation |
|------|-------------|------------------|
| LangGraph Adapter | LangGraph Agent → H2A Server Bridge | Enterprise Architect |
| Vercel AI SDK Adapter | H2A als Transport in useChat | Product Manager |
| Conformance Tests Standard | 100+ Tests für H2A Standard Level | Protocol Designer |
| H2A Cockpit Full Integration | Alle 9 Seiten nutzen H2A wo möglich | Product Manager |
| "The Missing Protocol" Blog Post | Launch-Narrative, Technical Deep Dive | Industry Analyst |

### Akzeptanz:
- LangGraph Agent antwortet über H2A Transport im Playground
- Vercel AI SDK Demo läuft mit H2A Backend
- Blog Post ist publish-ready

---

## Sprint 5: Hardening (KW 25-26, 19.06 — 02.07)

### Ziel: Production-ready, alle Rollen validiert

| Task | Deliverable | Rolle-Validation |
|------|-------------|------------------|
| Security Audit | Penetration Test gegen Mock Agent + Client | Security Researcher |
| Accessibility Audit | WCAG 2.2 AA gegen @h2a/react + Playground | Accessibility Auditor |
| Performance Benchmarks | Latency, Throughput, Memory, Battery | Performance Engineer |
| Enterprise Features | Multi-Tenancy Headers, Audit Log Schema | Enterprise Architect |
| GDPR Implementation | Data Export/Delete Endpoints in Python | Privacy Officer |
| Conformance Tests Full | 150+ Tests für H2A Full Level | Protocol Designer |

### Akzeptanz:
- Kein CRITICAL Security Finding offen
- WCAG 2.2 AA: 0 Violations in @h2a/react
- Full Conformance: 150+ Tests grün

---

## Sprint 6: Launch (KW 27-28, 03.07 — 16.07)

### Ziel: Public Launch, Community Building

| Task | Deliverable | Rolle-Validation |
|------|-------------|------------------|
| CrewAI Adapter | CrewAI Multi-Agent → H2A | Enterprise Architect |
| v1.0 Spec Finalization | All 12 Roles sign off | All |
| GitHub Repo Polish | Badges, Contributing Guide, CoC, Templates | Open Source Community |
| Conference Submissions | AI Engineer Summit, JSConf, PyCon | Industry Analyst |
| Launch on HN/Reddit/Twitter | Blog Post + Playground Link | Product Manager |
| Co-Author Outreach | 5+ Contributors from 3+ Orgs | Open Source Community |

### Akzeptanz:
- v1.0 Tag auf GitHub
- npm @h2a/core v1.0.0 published
- Blog Post live, HN submitted
- GitHub Stars: tracking toward 1000

---

## Sprint Cadence

Jeder Sprint folgt:

```
Day 1-2:   Plan + Design (Spec-Arbeit, Architecture)
Day 3-8:   Build (Code, Tests, Docs)
Day 9:     Role Validation (12 Rollen checken die Ergebnisse)
Day 10:    Retro + Next Sprint Prep
```

## Risk Mitigation per Sprint

| Sprint | Größtes Risiko | Mitigation |
|--------|---------------|------------|
| 1 | Mock Agent zu komplex | Nur 2 Scenarios zunächst (echo + orchestrate) |
| 2 | CDDL Lernkurve | JSON Schema bleibt primary, CDDL als Bonus |
| 3 | React SDK Scope Creep | Nur 3 Hooks, 2 Components. Mehr in v1.1. |
| 4 | LangGraph API Changes | Adapter als thin wrapper, nicht deep integration |
| 5 | Security Findings | 2 Tage Buffer für Fixes eingeplant |
| 6 | Launch Timing | Blog Post vorschreiben in Sprint 4, nur polishen |

---

## Tracking

Sprint-Status wird tracked in:
- GitHub Projects Board (h2a-protocol repo)
- Jeder Sprint hat ein GitHub Milestone
- Jedes Feature hat ein GitHub Issue

---

*Dieser Plan wird nach jedem Sprint-Retro aktualisiert.*

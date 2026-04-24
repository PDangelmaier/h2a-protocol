# PRD: H2A Protocol — De-Facto Standard v1.0

**Produkt:** H2A (Human-to-Agent Protocol)
**Company:** The1ne
**Author:** Philipp Dangelmaier (PDangelmaier)
**Status:** Active
**Created:** 2026-04-24
**Target:** H2A v1.0 — Industry Standard

---

## Vision

H2A wird der offene Standard für die Interaktion zwischen Menschen und KI-Agenten. Wie HTTP die Kommunikation zwischen Browsern und Servern standardisierte, standardisiert H2A die Kommunikation zwischen beliebigen Frontends und beliebigen Agent-Backends.

Die Welt baut gerade tausende Agent-UIs. Jede erfindet das Rad neu. H2A beendet das.

## Problem

Stand April 2026:
- **MCP** (Anthropic/LF) standardisiert Agent ↔ Tool
- **A2A** (Google/LF) standardisiert Agent ↔ Agent
- **AG-UI** (CopilotKit) versucht Agent ↔ User, aber: kein Security Model, keine A11y Spec, kein Privacy Framework, CopilotKit-adjacent

Die Human-Agent-Grenze ist der letzte nicht-standardisierte Layer im AI-Stack. Jedes Projekt löst dieselben 6 Probleme individuell: UI-Kontext, Streaming, Rich UI, UI-Manipulation, Interruption, Presence.

## Ziel

H2A v1.0 als De-Facto-Standard durch überlegene Technik und Reference Implementation:
1. Die beste Spec (security-first, a11y-first, privacy-first)
2. Die beste Reference Implementation (TypeScript + Python)
3. Die beste Developer Experience (Playground, Mock Agent, Test Suite)
4. Reale Adoption (Adapter für LangGraph, CrewAI, Vercel AI SDK)

## Erfolgskriterien

| Metrik | Ziel | Zeitrahmen |
|--------|------|------------|
| GitHub Stars | 1.000 | 6 Monate |
| npm Downloads (@h2a/core) | 5.000/Woche | 6 Monate |
| Reference Implementations | 3+ (TS, Python, Go) | 4 Monate |
| Framework Adapter | 3+ (LangGraph, CrewAI, Vercel) | 6 Monate |
| Co-Authors | 5+ aus 3+ Organisationen | 6 Monate |
| Conference Talks | 3+ (AI Engineer Summit etc.) | 8 Monate |
| Enterprise Pilot | 1+ (Mercedes-Benz via H2A Cockpit) | 3 Monate |

## Nicht-Ziele (explizit Out-of-Scope)

- H2A ist KEIN Framework, KEIN SDK, KEINE Library
- H2A definiert NICHT wie UI gerendert wird
- H2A definiert NICHT welches LLM verwendet wird
- H2A ist KEIN Konkurrent zu MCP oder A2A — es ist das dritte Puzzleteil

## Stakeholder-Rollen (Review Board)

Jede Entscheidung wird gegen diese 12 Rollen validiert:

### Technisch
1. **Protocol Designer** — Formale Korrektheit, IETF/W3C-Kompatibilität, ABNF/CDDL
2. **Security Researcher** — Threat Model, XSS, SSRF, Session Security, Prompt Injection
3. **Accessibility Auditor** — WCAG 2.2 AA, Screen Reader, Focus Management, Cognitive Load
4. **Performance Engineer** — Latency, Bandwidth, Battery, Offline, Reconnection
5. **Mobile/IoT Developer** — React Native, Flutter, Watch, Car (MBUX), Voice

### Business
6. **Enterprise Architect** — Multi-Tenancy, RBAC, Audit, SOC2/HIPAA/PCI, SSO
7. **Privacy Officer (DPO)** — GDPR Art. 6/7/15-22, Data Minimization, Consent, Retention
8. **Product Manager** — Developer Experience, Time-to-Hello-World, Migration Path

### Ecosystem
9. **AG-UI Team (Critic)** — "Warum nicht AG-UI erweitern?"
10. **MCP/A2A Teams (Critic)** — "Ist H2A wirklich nötig?"
11. **Open Source Community** — Governance, RFC Process, Bus Factor, Licensing
12. **Industry Analyst** — Market Timing, Adoption Curve, Standards Body Path

## Reifegrad-Definition

| Level | Definition | Artefakte |
|-------|-----------|-----------|
| **Draft** | Konzept, noch instabil | Spec Markdown, keine Implementierung |
| **Candidate** | Stabil genug für Implementierung | Spec + JSON Schemas + Test Vectors |
| **Standard** | 2+ unabhängige Implementierungen, Test Suite grün | Spec + SDKs + Test Suite + Adapters |
| **Adopted** | Reale Produkte nutzen H2A in Production | Case Studies + Conference Talks |

**Aktueller Stand:** Draft (v0.1)
**Ziel:** Standard (v1.0) in 6 Monaten

## Feature-Priorisierung

### P0 — Muss für Standard (v0.2 → v1.0)

1. **Reference Implementation `@h2a/core`** — Vollständiger TS Client + Server
2. **Reference Implementation `h2a-python`** — Vollständiger Python Server (FastAPI)
3. **H2A Conformance Test Suite** — Automatisierte Tests gegen jede Implementierung
4. **H2A Playground** — Interaktive Web-App zum Testen des Protokolls
5. **H2A Mock Agent** — Deterministic Agent für CI/CD
6. **H2A Cockpit Integration** — Demo-Chat spricht echtes H2A-Protokoll
7. **Spec v0.2** — AG-UI Event Alignment, MCP/A2A Version Updates, Voice "v0.3" honest
8. **AG-UI Diff-Dokument** — Punkt-für-Punkt Vergleich mit konkreten Lücken
9. **LangGraph Adapter** — Proof dass existierende Agents H2A sprechen können
10. **Formal Grammar (CDDL)** — Für IETF-Track Readiness

### P1 — Wichtig für Adoption

11. **React SDK `@h2a/react`** — Hooks + Components
12. **Vercel AI SDK Adapter** — H2A als Transport in useChat
13. **CrewAI Adapter** — Multi-Agent → H2A Bridge
14. **AG-UI → H2A Migration Guide** — Konkreter Migrationspfad
15. **"The Missing Protocol" Blog Post** — Launch-Narrative

### P2 — Nice-to-Have

16. **Vue/Svelte SDKs**
17. **Go Server Library**
18. **Agent Registry MVP**
19. **H2A Certification Badge**
20. **Conference Talk Materials**

## User Stories (Developer Perspective)

### Story 1: Hello World
Als Frontend-Entwickler möchte ich in unter 5 Minuten einen H2A-Agent in meine React-App integrieren.
```bash
npm install @h2a/react
```
```tsx
import { H2AChat } from '@h2a/react';
<H2AChat endpoint="http://localhost:8100/h2a" />
```

### Story 2: Framework-Wechsel ohne Pain
Als Backend-Entwickler möchte ich von LangChain zu CrewAI wechseln ohne mein Frontend anzufassen.
→ Beide Backends sprechen H2A. Frontend bleibt identisch.

### Story 3: Enterprise Security
Als Enterprise Architect möchte ich wissen welche Daten mein Agent sehen kann.
→ OrchestrationPolicy, StateSnapshot Allowlisting, Audit Logs.

### Story 4: Accessibility
Als blinder Nutzer möchte ich einen AI-Agenten per Screen Reader bedienen.
→ ARIA Roles per Frame Type, Focus Management, Voice-Only Mode.

## Competitive Landscape (April 2026)

| | AG-UI | H2A | MCP | A2A |
|---|---|---|---|---|
| Layer | Human↔Agent | Human↔Agent | Agent↔Tool | Agent↔Agent |
| Version | 0.0.52 | 0.1 draft | 2025-11-25 | v1.0.0 |
| Governance | CopilotKit (MIT) | The1ne (MIT) | Linux Foundation | Linux Foundation |
| Security Model | — | Sandboxing, Tiers, Audit | Token-based | OAuth2, mTLS |
| Accessibility | — | WCAG 2.2 AA normative | N/A | N/A |
| Privacy | — | GDPR, Data Minimization | — | — |
| Presence | Lifecycle only | 4 Breathing States | N/A | N/A |
| SDKs | TS | TS + Python (WIP) | TS, Python, Go, Java, C# | Python, Go, TS, Java, .NET |
| Integrations | 15+ | 0 (yet) | 100+ | 10+ |
| Stars | 13k | <100 | 40k+ | 20k+ |

**H2A's Moat:** Security + A11y + Privacy + Presence + Transport Agnosticism.
**H2A's Weakness:** Zero Adoption, Single Author, No Integrations.

## Risiken

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|--------------------:|-------:|------------|
| AG-UI adds Security/A11y | Hoch (6 Mo) | Hoch | Schneller sein. V0.2 in 4 Wochen. |
| Standards Body ignoriert H2A | Mittel | Mittel | De-Facto-Standard durch Adoption. |
| Kein Community Buy-In | Mittel | Hoch | Killer Demo + Blog Post + Conference. |
| Scope Creep (Voice, Collab) | Hoch | Mittel | Strict Versioning: Voice = v0.3. |

---

*Dieses Dokument ist das Single Source of Truth für die H2A Standardisierung.*

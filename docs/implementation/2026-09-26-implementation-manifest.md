# H2A Implementation Manifest v3.0

**Finale Synthese der Implementation Doktorarbeit — Genehmigt von 12 Experten-Rollen**

> *"Der Agent ist nur so gut wie sein Entwicklungsprozess."*
> *"Wer den Prozess kontrolliert, kontrolliert die Qualität. Wer die Qualität kontrolliert, kontrolliert das Produkt."*

Erstellt: 2026-09-26
Autor: Philipp Dangelmaier, Product Owner H2A
Methodik: 7 spezialisierte AI-Research-Agents, 12 Expert-Panel-Rollen
Status: **APPROVED (12/12) ✅**

---

## Inhaltsverzeichnis

1. [Executive Summary](#executive-summary)
2. [Die 7 Gebote der H2A-Implementierung](#gebote)
3. [Expert Panel: Implementation](#expert-panel)
4. [Synthese der 7 Forschungsstudien](#synthese)
5. [Die H2A Development Engine](#dev-engine)
6. [Die 5 Säulen der Implementierung](#saeulen)
7. [Critical Implementation Decisions](#decisions)
8. [Risk Matrix & Mitigation](#risiken)
9. [16-Wochen-Fahrplan](#fahrplan)
10. [Cost-Benefit-Analyse](#kosten)
11. [Go/No-Go Checkliste](#go-nogo)
12. [Konkrete Erste Schritte (Woche 0)](#woche-0)
13. [Abschlussrechnung](#rechnung)
14. [Epilog](#epilog)

---

## 1. Executive Summary {#executive-summary}

Diese Implementation Doktorarbeit definiert **WIE** der Mercedes-Benz H2A Virtual Assistant gebaut wird. Sie ergänzt die Product Doktorarbeit (16.856 Zeilen, **WAS** gebaut wird) um den konkreten Entwicklungsprozess, die Tool-Chain, die Methodik und den Sprint-Plan.

**Die zentrale Erkenntnis:** H2A ist nicht nur ein Produkt — es ist ein **Paradigmenwechsel** in der Softwareentwicklung. Ein Product Owner ("der Dirigent") orchestriert N AI-Agents, die parallel in isolierten Worktrees entwickeln, reviewen, testen und deployen. Skills kodifizieren Best Practices als ausführbare Prozesse. Hooks erzwingen Quality Gates automatisch.

**Die 7 Forschungsstudien im Überblick:**

| # | Studie | Kernfrage | Antwort |
|---|--------|-----------|---------|
| IR-1 | Claude Code Mastery | Welches Tool, wie konfiguriert? | Claude Code + 47 Skills + 39 Hooks + MCP = überlegenes Ökosystem |
| IR-2 | Multi-Agent Development | Wie arbeiten mehrere Agents zusammen? | Worktree-Isolation + Architect/Coder/Reviewer Pattern |
| IR-3 | Testing & Quality für AI | Wie testet man Non-Determinismus? | Golden Tests + LLM-as-Judge + Red Teaming + Langfuse |
| IR-4 | AI Development Process | Wie plant man AI-Entwicklung? | Evaluation-Driven Dev + Prompt-as-Code + LLMOps |
| IR-5 | H2A Skill & Hook Architecture | Welche Skills/Hooks für H2A? | 6 neue Skills + 5 neue Hooks = Development-Betriebssystem |
| IR-6 | Implementation Blueprint | Wie sieht der Plan aus? | 16 Wochen, 4 Phasen, Dev-Cost-ROI > 8.000% |
| IR-7 | DevOps/MLOps für AI | Wie betreibt man AI in Production? | Langfuse + Canary + Kill Switch + Cost Engineering |

---

## 2. Die 7 Gebote der H2A-Implementierung {#gebote}

### I. Eval-First Development — Schreibe die Evaluation VOR dem Prompt

> *"Du kannst nicht verbessern, was du nicht messen kannst."*

**Das Gebot:** Definiere die Golden Tests BEVOR du den System Prompt schreibst. Jeder Agent Behavior bekommt mindestens 5 Testfälle, bevor er implementiert wird.

**Begründung:** Ohne klare Erfolgskriterien optimiert der Entwickler auf Gefühl statt auf Daten. Golden Tests sind der Vertrag mit dem Kunden — sie definieren, was der Agent können MUSS. Evaluation-Driven Development (EDD) ist das AI-Äquivalent von Test-Driven Development.

**Beispiel:**
```yaml
# ZUERST: Golden Test definieren
- name: pricing_question_basic
  vars:
    user_message: "Was kostet der EQS 450?"
  assert:
    - type: contains
      value: "ab"
    - type: llm-rubric
      value: "Nennt einen realistischen Preis, verweist auf Konfigurator"
    - type: not-contains
      value: "weiß ich nicht"
    - type: latency
      threshold: 3000

# DANN: System Prompt schreiben der diesen Test besteht
```

**Anti-Pattern:**
- ❌ Prompt schreiben → "sieht gut aus" → deployen → Überraschung in Production
- ❌ Tests nach dem Prompt schreiben (Confirmation Bias)
- ❌ Nur manuelle Prüfung ohne wiederholbare Evaluation

**Quelle:** IR-3, IR-4, Harrison Chase (LangChain), Hamel Husain, Eugene Yan "Guardian Metrics"

---

### II. Minimal Viable Agent, dann iterieren

> *"Foundation MUSS stehen bevor Intelligence beginnt."*

**Das Gebot:** Phase 1 (Foundation) muss funktionieren bevor Phase 2 (Intelligence) beginnt. Tool Adapter + Consent + Memory sind die Grundpfeiler.

**Die Reihenfolge:**
```
Woche 1-4: Foundation
  ├── Tool Adapter Layer (KRITISCH — ohne das: kein Agent)
  ├── Consent Architecture (KRITISCH — ohne das: kein DSGVO)
  ├── CCP System Prompt (9 Layer funktionierend)
  └── Basis-Memory (Session-basiert)

Woche 5-8: Intelligence  ← NUR wenn Foundation stabil
Woche 9-12: Channels     ← NUR wenn Intelligence stabil
Woche 13-16: Production   ← NUR wenn Channels stabil
```

**Anti-Pattern:**
- ❌ MBUX-Voice starten bevor Tool Adapter funktioniert
- ❌ Personalisierung bauen bevor Consent-System steht
- ❌ Multi-Channel bevor Single-Channel stabil

**Quelle:** IR-6 (Blueprint), IR-5 (Skill Architecture)

---

### III. AI baut AI, Mensch dirigiert

> *"1 PO + N AI-Agents > 5 menschliche Entwickler — wenn der PO weiß, wann er eingreifen muss."*

**Das Gebot:** Claude Code + Skills + Hooks + Multi-Agent ist das Entwicklungsteam. Der PO trifft Architektur-Entscheidungen und schmeckt ab. Er schreibt keinen Code — er dirigiert die Agents.

**Der PO-Workflow:**
```
1. /office-hours        → Idee validieren, Scope definieren
2. /plan-eng-review     → Architektur reviewen lassen
3. /h2a-dev            → Development-Workflow starten
   └── Claude Code spawnt Architect → Coder (3x parallel) → Reviewer → Tester
4. PO reviewt Output   → 5 Minuten, nicht 5 Stunden
5. /qa                 → Automatisiertes Testing
6. /ship               → PR + Deploy
```

**Anti-Pattern:**
- ❌ PO schreibt selbst Code statt Agents zu steuern
- ❌ Agents arbeiten ohne PO-Review (Qualität sinkt)
- ❌ Kein Reviewer-Agent bei paralleler Arbeit

**Quelle:** IR-1 (Claude Code Mastery), IR-2 (Multi-Agent Development)

---

### IV. Jede Änderung durch 3 Gates

> *"LLM-Systeme haben mehr Failure-Modi als deterministische Software."*

**Die 3 Gates:**
```
Gate 1: Type-Check (tsc --noEmit)
  → Fängt: Syntax-Fehler, Import-Fehler, Interface-Brüche
  → Hook: pre-commit (automatisch)

Gate 2: Golden Tests (promptfoo eval)
  → Fängt: Regressions, Halluzinationen, Brand-Safety-Verstöße
  → Hook: pre-push (automatisch, blockierend)

Gate 3: Code Review (/review oder Reviewer-Agent)
  → Fängt: Architektur-Fehler, Security-Lücken, Seiteneffekte
  → Workflow: PR-Review vor Merge
```

**Anti-Pattern:**
- ❌ "Nur ein Prompt-Change, braucht keine Tests" → FALSCH
- ❌ Golden Tests skippen weil "zu langsam" → Smoke-Suite (10s)
- ❌ Self-Merge ohne Review

**Quelle:** IR-3, IR-5, IR-7

---

### V. Prompts sind Code — versioniert, reviewed, deployed

> *"Ein System Prompt ist die Persönlichkeit deines Agents."*

**Prompt-as-Code Struktur:**
```
packages/mb-agent/src/prompts/
├── system/                        # CCP Layers
│   ├── layer-01-identity.ts       # "Du bist der Mercedes-Benz Assistent"
│   ├── layer-02-market.ts         # Marktspezifische Anpassungen
│   ├── layer-03-channel.ts        # Kanalspezifische Regeln
│   ├── layer-04-journey.ts        # Phase im Kaufprozess
│   ├── layer-05-proactivity.ts    # Proaktivitäts-Level
│   ├── layer-06-identity-pid.ts   # PID-Score-abhängig
│   ├── layer-07-memory.ts         # Kontext aus Memory
│   ├── layer-08-guardrails.ts     # Sicherheits-Constraints
│   └── layer-09-compliance.ts     # Rechtliche Anforderungen
├── tools/                         # Tool-Definitionen
└── registry.ts                    # Prompt Registry mit Versionen
```

**Quelle:** IR-4 (AI Dev Process), IR-7 (DevOps/MLOps), Karpathy "Hottest programming language is English"

---

### VI. Production ist die einzige Wahrheit

> *"Staging-Tests sind notwendig, aber nicht hinreichend."*

**Production-Validation-Pipeline:**
```
1. Canary Deploy (5% Traffic)
2. Langfuse-Monitoring (Latenz, Token, Quality Score)
3. Hallucination Alert (> 2% → automatischer Rollback)
4. Brand Safety Alert (Confidence < 0.8 → Human Review Queue)
5. Nach 24h ohne Alarm: Ramp-Up auf 25% → 50% → 100%
```

**Anti-Pattern:**
- ❌ Big-Bang-Deployment (0% → 100%)
- ❌ Monitoring nur für Fehler, nicht für Qualität
- ❌ Kein automatischer Rollback

**Quelle:** IR-6, IR-7

---

### VII. Security ist kein Feature — Security ist eine Eigenschaft

> *"Ein AI-Agent der Prompt Injection erlaubt, ist schlimmer als kein Agent."*

**4-Layer Security:**
```
Layer 1: Input Sanitization
  → Prompt Injection Detection (NeMo Guardrails + LLM-Judge)

Layer 2: Guardrails im System Prompt
  → CCP Layer 8: "Du darfst NIEMALS..."

Layer 3: Tool Permission Checking
  → PID-Score-basierte Freigabe + Consent-Prüfung

Layer 4: Output Validation
  → Brand Safety + PII Detection + Hallucination Check
```

**Quelle:** IR-3 (Red Teaming), IR-6 (Security Phase), OWASP LLM Top 10

---

## 3. Expert Panel: Implementation {#expert-panel}

### Panel-Zusammensetzung

| # | Rolle | Fokus | Guru/Vorbild |
|---|-------|-------|--------------|
| 1 | **Claude Code Power User** | Skills, Hooks, MCP, Autonomous Workflow | Anthropic Engineering |
| 2 | **Multi-Agent Orchestrator** | Parallel Dev, Worktrees, Agent Teams | Andrew Ng (4 Agentic Patterns) |
| 3 | **AI Testing Lead** | Golden Tests, Eval Pipeline, Red Teaming | Hamel Husain, Harrison Chase |
| 4 | **LLMOps Engineer** | CI/CD, Prompt Versioning, Model Pinning | Chip Huyen, Eugene Yan |
| 5 | **DevProcess Architect** | Skills-as-Process, Hooks-as-Gates | Kent Beck, Martin Fowler |
| 6 | **Implementation Planner** | 16-Wochen-Blueprint, Dependencies | Gene Kim, Nicole Forsgren |
| 7 | **Security Engineer** | Red Team, OWASP LLM, Prompt Injection | OWASP Foundation |
| 8 | **DSGVO/Privacy Officer** | Consent-Testing, Audit, Compliance | EU AI Act Komitee |
| 9 | **Automotive UX Lead** | MBUX Safety, Kognitive Last | NHTSA Guidelines |
| 10 | **Cost Controller** | Token-Budget, ROI, Break-Even | a16z AI Cost Analysis |
| 11 | **Quality Assurance Lead** | Hallucination Detection, Brand Safety | Simon Willison |
| 12 | **Release Manager** | Canary Deploy, Feature Flags, Rollback | Google SRE |

### Detaillierte Voten

#### 1. Claude Code Power User — ✅ APPROVED
**Bedingung:** Skills müssen VOR Phase 1 erstellt werden.
**Begründung:** Die 6 H2A-Skills kodifizieren den gesamten Entwicklungsprozess. Ohne sie arbeiten die Agents ohne Leitplanken. Die bestehenden 47 Skills im Harness sind eine massive Stärke — sie müssen integriert, nicht ersetzt werden.

#### 2. Multi-Agent Orchestrator — ✅ APPROVED
**Bedingung:** Reviewer-Agent ist PFLICHT bei paralleler Arbeit.
**Begründung:** SWE-bench: Multi-Agent steigert Lösungsrate von ~50% auf ~65%. Aber ohne Reviewer divergieren Coder-Agents. Der Reviewer ist der "Dirigent" der Agents.

#### 3. AI Testing Lead — ✅ APPROVED
**Bedingung:** 100+ Golden Tests vor Launch. Hallucination < 2%.
**Begründung:** Die 5-Schichten-Pyramide (Unit → Integration → Golden → A/B → Human) ist der einzige Weg, AI-Qualität systematisch zu sichern. Golden Tests müssen die 7 Kanäle separat abdecken.

#### 4. LLMOps Engineer — ✅ APPROVED
**Bedingung:** Prompt Versioning ab Tag 1. Model Pinning (claude-sonnet-4-6).
**Begründung:** Prompts brauchen Versionierung, Testing und Rollback. Ohne Prompt Registry ist jede Änderung ein Glücksspiel. DORA-Metriken angepasst: Deployment = Prompt-Version-Frequency.

#### 5. DevProcess Architect — ✅ APPROVED
**Bedingung:** /h2a-dev Skill als allererster Schritt.
**Begründung:** Skills-as-Process kodifiziert Best Practices als Workflows. Hooks-as-Gates erzwingt Qualität automatisch. Die Autonomous Infrastructure v2.0 ist die Basis — H2A-Skills nutzen, nicht duplizieren.

#### 6. Implementation Planner — ✅ APPROVED
**Bedingung:** 4 Wochen Puffer realistisch und notwendig.
**Begründung:** Critical Path hat 12 Wochen. Puffer fängt Nexus-Probleme und MB-interne Abstimmungen ab. Größte Unbekannte: Nexus Gateway Integration — muss in Woche 0 validiert werden.

#### 7. Security Engineer — ✅ APPROVED
**Bedingung:** Red Team MUSS vor Launch passieren.
**Begründung:** 30 Red-Team-Szenarien VOR Production-Launch. Nexus-Guardrails mit H2A-Guardrails (CCP Layer 8) harmonisieren, nicht duplizieren.

#### 8. DSGVO/Privacy Officer — ✅ APPROVED
**Bedingung:** Consent-System in Woche 3 ist P0.
**Begründung:** Ohne Consent darf kein Tool personenbezogene Daten verarbeiten. 11 Consent-Typen implementiert und getestet bevor Personalisierung startet. LLM-DSGVO-Fragen rechtlich klären.

#### 9. Automotive UX Lead — ✅ APPROVED
**Bedingung:** MBUX-Prototype nur mit Safety-Check.
**Begründung:** NHTSA: keine visuellen Tasks > 2s, keine Interaktionen > 12s gesamt, keine komplexen Menüs > 5 km/h. Die 7 Kanäle haben fundamental unterschiedliche UX-Anforderungen.

#### 10. Cost Controller — ✅ APPROVED
**Bedingung:** ROI massiv positiv unter allen Szenarien.
**Begründung:** ~€0.046/Conversation vs. €5-15 menschlich. Token-Budget-Monitoring ab Tag 1 — ein unkontrollierter Multi-Tool-Loop kann €50+ kosten.

#### 11. Quality Assurance Lead — ✅ APPROVED
**Bedingung:** Continuous Eval Pipeline in CI/CD.
**Begründung:** LLM-as-Judge hat eigene Bias — "Judge Calibration" notwendig. 5 Guardian Metrics: Factuality >95%, Safety 100%, Relevance >90%, Brand >95%, Helpfulness >85%.

#### 12. Release Manager — ✅ APPROVED
**Bedingung:** Canary + Feature Flags + Rollback < 60s.
**Begründung:** Canary (5% → 25% → 50% → 100%) mit Auto-Rollback. Feature Flags für granulare Kontrolle. Rollback muss PROMPT + CODE umfassen.

### **Gesamtergebnis: 12/12 APPROVED ✅**

### Expert Panel: Produkt ↔ Implementation Mapping

Die 11 Produkt-Rollen (Final Manifest) definieren WAS richtig sein muss. Die 12 Implementation-Rollen definieren WIE es gebaut wird.

| Produkt-Rolle | Implementation-Rolle(n) | Schnittstelle |
|---------------|------------------------|---------------|
| Chief AI Architect | Claude Code Power User, Multi-Agent Orchestrator | Agentic Patterns → Claude Code Skills |
| Identity & Trust Engineer | Security Engineer, DSGVO/Privacy Officer | PID/Auth Design → Security Implementation |
| Safety & Alignment Lead | Security Engineer, AI Testing Lead | Guardrails Design → Red Teaming & Testing |
| RAG & Knowledge Engineer | AI Testing Lead, LLMOps Engineer | RAG Architecture → Evaluation Pipeline |
| Streaming & Infrastructure | DevProcess Architect, Release Manager | SSE/Latenz Design → CI/CD & Deployment |
| Privacy & Compliance Officer | DSGVO/Privacy Officer | Consent Design → Privacy Implementation |
| Behavioral Scientist | Automotive UX Lead | Nudge Theory → UX Implementation |
| Luxury Brand Strategist | Automotive UX Lead | Brand Voice → Channel-spezifische UX |
| Conversational Designer | Claude Code Power User | Dialog Design → CCP Prompt Engineering |
| Multimodal AI Specialist | Automotive UX Lead, LLMOps Engineer | Voice/Vision Design → MBUX Integration |
| Personalization Engineer | AI Testing Lead, Cost Controller | A/B Testing Design → Eval Framework & Kosten |
| — | Implementation Planner | Koordination aller Produkt-Anforderungen |
| — | Quality Assurance Lead | Übergreifende Qualitätssicherung |

---

## 4. Synthese der 7 Forschungsstudien {#synthese}

### IR-1: Claude Code Mastery (1.051 Zeilen)

**Key Finding:** Claude Code + Skills + Hooks + MCP ist die leistungsfähigste AI-Entwicklungsumgebung — überlegen gegenüber Cursor, Copilot und Devin in Enterprise-Szenarien.

**Implikation:** Die bestehenden 47 Skills und 39 Hooks sind eine massive Stärke. Die 6 neuen H2A-Skills ergänzen das Ökosystem.

**Handlung:** Skills VOR Code erstellen. Der Skill IST der Prozess.

### IR-2: Multi-Agent Development (1.232 Zeilen)

**Key Finding:** Worktree-basiertes Parallel-Development mit "Architect → Coder (3x) → Reviewer → Tester" erreicht ~65% auf SWE-bench (vs. ~50% single).

**Implikation:** 3 parallele Coder-Agents beschleunigen um 2-3x — NUR mit Reviewer als Quality Gate.

**Handlung:** Reviewer-Agent ist nicht optional. Architect definiert Interfaces VOR parallelem Coding.

### IR-3: Testing & Quality (1.690 Zeilen)

**Key Finding:** 5-Schichten-Pyramide: Unit → Integration → Golden → A/B → Human Eval. Promptfoo + DeepEval + Langfuse als State of the Art.

**Implikation:** 100+ Golden Tests als Rückgrat. 30 OWASP-LLM-Red-Team-Szenarien als Pflicht.

**Handlung:** Evaluation-Driven Development — Eval VOR dem Prompt. Promptfoo in CI/CD.

### IR-4: AI Development Process (1.233 Zeilen)

**Key Finding:** LLMOps = DevOps für AI: Prompt Versioning, Model Pinning, Eval Pipeline, A/B Testing. DORA-Metriken angepasst.

**Implikation:** Prompts sind die neue "Konfiguration" — gleicher Rigor wie Code.

**Handlung:** Prompt Registry ab Tag 1. Model Pinning (claude-sonnet-4-6). Shadow Testing.

### IR-5: H2A Skill & Hook Architecture (1.346 Zeilen)

**Key Finding:** 6 Skills + 5 Hooks machen den Entwicklungsprozess zum ausführbaren Workflow. /h2a-dev orchestriert den gesamten Zyklus.

**Implikation:** Der Skill IST das Betriebssystem der Entwicklung. Hooks erzwingen Gates automatisch.

**Handlung:** /h2a-dev als erster Schritt (Woche 0). Andere 5 Skills in Woche 1-2.

### IR-6: Implementation Blueprint (1.381 Zeilen)

**Key Finding:** 16 Wochen, 4 Phasen. Critical Path: 12 Wochen. Puffer: 4 Wochen. Dev-Cost-ROI: >8.000% (Produkt-ROI aus DR-6: 729%).

**Implikation:** Aggressiv aber machbar — wenn Nexus und Supabase in Woche 0 validiert.

**Handlung:** Keine Abkürzungen bei der Foundation. Woche 0 = Setup + Validation.

### IR-7: DevOps, MLOps & AI Infrastructure (1.230 Zeilen)

**Key Finding:** CI/CD für LLMs: Build → Eval → Shadow → Deploy. AI-spezifische Metriken (Hallucination Rate, Token Usage, Quality Score).

**Implikation:** Infrastructure as Code für H2A. Observability-Dashboards ab Tag 1.

**Handlung:** Langfuse ab Woche 1. Alerts bei Hallucination > 2% oder Latenz > 5s.

---

## 5. Die H2A Development Engine {#dev-engine}

### Das Betriebssystem der Entwicklung

```
┌─────────────────────────────────────────────────────────────────┐
│                    H2A DEVELOPMENT ENGINE                        │
│                                                                  │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │  SKILLS  │   │    HOOKS     │   │    MULTI-AGENT         │  │
│  │          │   │              │   │                        │  │
│  │ /h2a-dev │──▶│ pre-commit   │──▶│ Architect (1)          │  │
│  │ /h2a-eval│   │ pre-push     │   │ Coder (3, parallel)    │  │
│  │ /h2a-test│   │ nexus-check  │   │ Reviewer (1, Quality)  │  │
│  │ /h2a-mon │   │ consent-gate │   │ Tester (1, Eval)       │  │
│  │ /nexus   │   │ golden-gate  │   │ Deployer (1, Ship)     │  │
│  └──────────┘   └──────────────┘   └────────────────────────┘  │
│       │                │                       │                 │
│       ▼                ▼                       ▼                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    MCP SERVERS                            │   │
│  │  Context7 (Docs) │ Greptile (Code Intel) │ JIRA (Tasks) │   │
│  │  Serena (LSP)    │ Chrome (Browser QA)   │ KB-Agent     │   │
│  └──────────────────────────────────────────────────────────┘   │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              AUTONOMOUS INFRASTRUCTURE v2.0               │   │
│  │  Workflow State Machine │ Circuit Breaker │ Confidence    │   │
│  │  Task Persistence       │ Audit Trail     │ VETO System  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Feature-Workflow

```
┌─ PO entscheidet: "Feature X bauen" ──────────────────────────────┐
│                                                                   │
│  1. /h2a-dev startet                                             │
│     ├── Liest Memory + KB-Agent (bestehende Patterns)            │
│     ├── Liest H2A Bible (Architektur-Kontext)                    │
│     └── Erstellt Implementation-Plan                              │
│                                                                   │
│  2. PO reviewt Plan (5 Min) → Approved? → weiter                │
│                                                                   │
│  3. Architect-Agent: Interface-Design + Tests-Skelett            │
│                                                                   │
│  4. 3 Coder-Agents (parallel, in Worktrees)                     │
│     ├── Agent A: Tool Adapter                                    │
│     ├── Agent B: CCP Layer                                       │
│     └── Agent C: Frontend-Komponente                             │
│                                                                   │
│  5. Reviewer-Agent prüft alle 3 Branches                        │
│     └── Merge-Konflikte? → zurück zu Coder                      │
│                                                                   │
│  6. Tester-Agent: Golden Tests + Unit + E2E                      │
│     └── Tests rot? → zurück zu Coder                             │
│                                                                   │
│  7. PO schmeckt ab (5 Min im Browser) → /ship                   │
│                                                                   │
│  8. Canary Deploy → 24h clean → Full Rollout                    │
└──────────────────────────────────────────────────────────────────┘
```

### Development Lifecycle

```
 1. /office-hours          — Idee validieren
 2. /plan-ceo-review       — Scope definieren
 3. /plan-eng-review       — Architektur festlegen
 4. /jira-lead             — Tickets erstellen
 5. /h2a-golden-test       — Eval ZUERST (Gebot I)
 6. Agent Team spawnen     — Architect → Coder(×3) → parallel
 7. /review                — Code Review
 8. /h2a-eval              — Golden Tests + Hallucination Audit
 9. /qa                    — Browser QA + E2E
10. /h2a-deploy            — Canary mit AI Quality Gates
11. /h2a-monitor           — Production Monitoring
12. /retro                 — Weekly Retrospective
```

---

## 6. Die 5 Säulen der Implementierung {#saeulen}

### Säule 1: Eval-First
Jedes Feature beginnt mit der Evaluation — nicht mit dem Code.

### Säule 2: Skill-Driven
Jeder Prozessschritt ist ein Skill — reproduzierbar, dokumentiert, versioniert.

| Skill | Zweck | Output |
|-------|-------|--------|
| /h2a-dev | Feature-Workflow | Plan + Agents |
| /h2a-golden-test | Test definieren | promptfoo.yaml |
| /h2a-eval | Eval-Suite laufen | Score-Report |
| /nexus-test | Connectivity | Health-Check |
| /h2a-deploy | Deployment | Canary + Monitor |
| /h2a-monitor | Dashboards | Alert-Status |

### Säule 3: Agent-Parallel
```
main ──┬── worktree/feature-x-tool-adapter    (Agent A)
       ├── worktree/feature-x-ccp-layer       (Agent B)
       └── worktree/feature-x-frontend        (Agent C)
                                │
                     Reviewer mergt alle 3
```

### Säule 4: Gate-Protected
```
Code → tsc --noEmit → promptfoo eval --smoke → nexus-format-check → consent-check
Alles grün? → Push erlaubt
```

### Säule 5: Production-Verified
```
Deploy → Canary 5% → Langfuse Score OK? → Hallucination < 2%?
Alles grün? → Ramp-Up    │    Irgendwas rot? → Auto-Rollback < 60s
```

---

## 7. Critical Implementation Decisions {#decisions}

| # | Entscheidung | Empfehlung | Begründung |
|---|-------------|------------|------------|
| 1 | **LLM Provider** | Nexus (Bedrock) | MB-Compliance, kurze Model IDs (claude-sonnet-4-6) |
| 2 | **Datenbank** | Supabase | 18 fertige Migrationen, RLS, Edge Functions |
| 3 | **Streaming** | SSE | Einfacher, Bedrock-kompatibel, Edge-Cache-freundlich |
| 4 | **Multi-Model** | Routing | Sonnet Standard, Opus komplex, Haiku Klassifikation |
| 5 | **Observability** | Langfuse Self-Hosted | DSGVO-konform, beste LLM-Tracing-UX |
| 6 | **Testing** | Promptfoo | CLI-First, CI/CD-Integration, YAML |
| 7 | **Deployment** | MB CI/CD + Promptfoo | Compliance, internes Hosting |
| 8 | **Frontend** | React erweitern | @h2a/react existiert, nicht neu bauen |
| 9 | **State** | Supabase Realtime | Bereits integriert, RLS-kompatibel |
| 10 | **Netzwerk** | Zscaler | MB-Standard, bereits konfiguriert |

---

## 8. Risk Matrix & Mitigation {#risiken}

| # | Risiko | W | I | Mitigation |
|---|--------|---|---|------------|
| 1 | **Nexus Inkompatibilität** | M | K | Woche 0: Connectivity-Test. Fallback: direkte Bedrock API |
| 2 | **Hallucination bei Preisen** | H | K | Mandatory Tool Use + Source Grounding + Golden Tests |
| 3 | **Prompt Injection** | M | K | 4-Layer Defense + Red Team + NeMo Guardrails |
| 4 | **DSGVO durch Memory** | M | K | Consent VOR Memory + Auto-Löschung + Audit Trail |
| 5 | **Token-Kosten explodieren** | M | H | Budget-Monitoring + Max 5 Tool Loops + Haiku für FAQ |
| 6 | **Agent-Divergenz** | H | M | Reviewer PFLICHT + Architect definiert Interfaces |
| 7 | **Nexus Latenz > 5s** | N | H | Caching + Parallel Tools + Edge Functions |
| 8 | **MBUX Safety-Violation** | N | K | NHTSA-Patterns + Speed-Lock |
| 9 | **Model-Update bricht Verhalten** | M | H | Pinning + Shadow Test + Canary |
| 10 | **MB Genehmigungen verzögern** | H | M | 4 Wochen Puffer + parallel arbeiten |

*W = Wahrscheinlichkeit (N/M/H), I = Impact (M/H/K = Kritisch)*

### Eskalations-Matrix

| Schwere | Reaktion | Zeit | Wer |
|---------|----------|------|-----|
| Kritisch | Auto-Rollback + Alert | < 60s | System |
| Hoch | PO-Entscheidung + Hotfix | < 4h | PO + Agents |
| Mittel | Nächster Sprint | < 1 Woche | Sprint |
| Niedrig | Backlog | Release | Grooming |

---

## 9. 16-Wochen-Fahrplan {#fahrplan}

### Phase 1: Foundation (Woche 1-4)

| Woche | Meilenstein | Deliverables | Gate |
|-------|------------|-------------|------|
| 1 | **Monorepo + Edge Function + SSE** | Basis-Infrastruktur, Stream funktioniert | SSE Test grün |
| 2 | **Tool Adapter Layer** | 5+ Tools, Bedrock Converse Format | Tool-Call E2E |
| 3 | **CCP + Consent** | 9 Prompt-Layer, 11 Consent-Typen | 20 Golden Tests |
| 4 | **Session + Memory** | Session-Resume, Basis-Memory | 50 Golden Tests |

**Phase-Gate:** Agent kann beraten, Tools aufrufen, Consent prüfen, Session speichern.

### Phase 2: Intelligence (Woche 5-8)

| Woche | Meilenstein | Deliverables | Gate |
|-------|------------|-------------|------|
| 5 | **ISP Engine** | 22 Signale, Decay, Phase-Multiplikatoren | Signal-Tests grün |
| 6 | **Memory System** | 5 Typen, Extraction, Pruning | Memory E2E |
| 7 | **Identity Nudge** | CCP Layer 10, 8 Patterns, Magic Moments | Conversion > Baseline |
| 8 | **Multi-Model-Routing** | Sonnet/Opus/Haiku, Cost-Optimierung | 30% Kosten-Reduktion |

**Phase-Gate:** Personalisierung, Memory, Routing funktionieren. 80+ Golden Tests.

### Phase 3: Channels (Woche 9-12)

| Woche | Meilenstein | Deliverables | Gate |
|-------|------------|-------------|------|
| 9 | **WhatsApp** | Business API, Text-Only, Opt-In | WhatsApp E2E |
| 10 | **Smart Storefront** | QR-Auth, Proximity, Dealer-Modus | QR→Auth→Personal |
| 11 | **MBUX Prototype** | Voice-Only, Safety-Lock | NHTSA bestanden |
| 12 | **App Integration** | React Native Widget, Deep Link | Biometric Auth |

**Phase-Gate:** Min. 3 Kanäle E2E. Kanalspezifische Golden Tests. 100+ Tests gesamt.

### Phase 4: Production (Woche 13-16)

| Woche | Meilenstein | Deliverables | Gate |
|-------|------------|-------------|------|
| 13 | **Observability** | Langfuse, 3 Dashboards, Alerts | Traces sichtbar |
| 14 | **Security + DSGVO** | Red Team (30 Szenarien), Audit | 0 kritische Findings |
| 15 | **Load Test** | 1.000 concurrent, P95 < 3s | Performance OK |
| 16 | **Soft Launch** | Canary 5%, Monitoring, Feedback | ALLE Gates grün |

**Launch-Gate:** Red Team bestanden. Load Test bestanden. 100+ Golden Tests grün. Rollback < 60s getestet.

---

## 10. Cost-Benefit-Analyse {#kosten}

### Kosten

| Position | Monatlich | Jährlich |
|----------|-----------|----------|
| Claude Code (Development) | ~$1.000 | ~$12.000 |
| Supabase Pro | ~$300 | ~$3.600 |
| Nexus Gateway | MB-intern | MB-intern |
| Promptfoo (OSS) | $0 | $0 |
| Langfuse (Self-Hosted) | ~$100 | ~$1.700 |
| Token-Kosten Production | ~$3.000 | ~$36.000 |
| **GESAMT** | **~$4.400** | **~$53.300** |

### Nutzen (konservativ)

| Dimension | Wert/Jahr |
|-----------|-----------|
| vs. 5-köpfiges Dev-Team | ~$500.000 Einsparung |
| Conversion +1% bei 100M€ Umsatz | ~$1.000.000 |
| Service-Anfragen -20% | ~$200.000 |
| **Konservativer Nutzen** | **>$1.700.000** |

### ROI (Betriebskosten-basiert)

```
Vollständig:   ($1.700.000 - $53.300) / $53.300 = 3.089% (Betriebs-ROI)
Konservativ (10%): ($170.000 - $53.300) / $53.300 = 219%
Breakeven: < 2 Monate nach Launch

Vergleich: Produkt-ROI (DR-6, inkl. Team): 729%
           Dev-Cost-ROI (IR-6, nur AI-Kosten): 8.337%
```

---

## 11. Go/No-Go Checkliste {#go-nogo}

### MUST (vor Phase 1)

| # | Kriterium | Owner | Due |
|---|-----------|-------|-----|
| 1 | Nexus Gateway erreichbar (Staging) | PO | W0 Tag 1 |
| 2 | Bedrock Converse Format validiert | PO | W0 Tag 1 |
| 3 | Supabase + 18 Migrationen | PO | W0 Tag 2 |
| 4 | Monorepo-Struktur steht | PO | W0 Tag 1 |
| 5 | 6 H2A-Skills erstellt | PO | W0 Tag 2 |
| 6 | 5 Hooks aktiv | PO | W0 Tag 2 |
| 7 | Promptfoo + 10 Golden Tests grün | PO | W0 Tag 3 |
| 8 | JIRA Board Sprint 1-4 | PO | W0 Tag 1 |
| 9 | Zscaler-Zugang bestätigt | PO/IT | W0 Tag 1 |

### SHOULD (vor Phase 2)

| # | Kriterium | Owner | Due |
|---|-----------|-------|-----|
| 10 | Langfuse Self-Hosted | PO/DevOps | W4 |
| 11 | KB-Agent mit H2A-Wissen | PO | W2 |
| 12 | CI/CD mit Golden-Test-Gate | DevOps | W4 |
| 13 | 50+ Golden Tests | PO | W4 |

### NICE (vor Launch)

| # | Kriterium | Owner | Due |
|---|-----------|-------|-----|
| 14 | Observability-Dashboards | DevOps | W13 |
| 15 | Red Team Report | Security | W14 |
| 16 | Load Test Bericht | DevOps | W15 |
| 17 | DSGVO-Audit bestanden | Privacy | W14 |
| 18 | 100+ Golden Tests | QA | W12 |

---

## 12. Konkrete Erste Schritte (Woche 0) {#woche-0}

### Tag 1: Infrastructure Validation

```
□ Nexus Gateway testen:
  curl -X POST https://genai-nexus.emea.api.corpinter.net/v1/converse
  Model: claude-sonnet-4-6 (SHORT-FORM!)
  Format: Bedrock Converse API (NICHT Anthropic Messages!)

□ Supabase aufsetzen + 18 Migrationen

□ Monorepo validieren:
  packages/mb-agent | packages/mb-agent-react | playground/

□ JIRA Board: H2A Sprint 1-4
```

### Tag 2: Skills & Hooks

```
□ 6 Skills erstellen:
  /h2a-dev | /h2a-golden-test | /h2a-eval
  /h2a-deploy | /h2a-monitor | /nexus-test

□ 5 Hooks erstellen:
  nexus-format-validator.sh | consent-check.sh
  golden-test-gate.sh | token-budget-check.sh | mbux-safety-check.sh

□ Promptfoo konfigurieren (promptfoo.yaml mit Nexus-Provider)
```

### Tag 3: Erste Golden Tests

```
□ 10 Golden Tests: Preise, Brand Safety, Tool Use, Consent, Out-of-Scope

□ Promptfoo-Run: npx promptfoo eval --config promptfoo.yaml

□ Baseline-Scores: Relevance, Faithfulness, Brand Safety, Latency P50/P95
  → Diese Scores sind der AUSGANGSPUNKT
```

### Tag 4-5: Tool Adapter Start

```
□ /plan-eng-review → Tool Adapter Architektur
□ Architect-Agent → Interface-Design (TypeScript Interfaces, 24 Tools)
□ PO reviewt (5 Min)
□ 3 Coder-Agents in Worktrees:
  Agent A: Pricing Tools | Agent B: Dealer Tools | Agent C: Configurator Tools
```

---

## 12b. Roadmap-Harmonisierung: Produkt ↔ Implementation {#roadmap-harmonisierung}

Die Produkt-Doktorarbeit (Final Manifest, Kap. 18) beschreibt **WAS** in welcher Phase gebaut wird (Business-Sicht).
Die Implementation-Doktorarbeit (IR-6, Blueprint) beschreibt **WIE** es technisch umgesetzt wird (Developer-Sicht).

### Mapping: Produkt-Phase → Implementation-Sprint

| Produkt-Phase | Zeitraum | Impl-Monat | WAS wird gebaut | WIE wird es gebaut |
|---------------|----------|-----------|----------------|-------------------|
| Phase 0: Foundation | Wo 1–4 | — | Basis-Agent (✅ vorhanden) | Setup: Skills, Hooks, Worktrees |
| Phase 1: Production-Ready | Wo 5–10 | Monat 1–2 | Tool Adapter, Consent, RAG, Guardrails | Sprint 1–4, Multi-Agent Dev |
| Phase 1 (cont.) | Wo 5–10 | Monat 2 | Multi-Model, Nudge, Journey Phase | Agent Orchestration Patterns |
| Phase 2: Scale & Polish | Wo 11–16 | Monat 3–4 | WhatsApp, MBUX, Observability, Security | Channel Integration, DevOps |
| Phase 3: Intelligence | Wo 17–24 | Monat 5–6 | Federated Learning, Analytics, EU AI Act | MLOps Pipeline |
| — (Scale) | — | Monat 7–12 | EU-Märkte, App, Dealer, Full MBUX | Scale & Expand |

> **Warum die unterschiedliche Reihenfolge?** Die Produkt-Roadmap priorisiert nach Business Value (Production-Ready vor Intelligence). Die Implementation-Roadmap priorisiert nach technischer Abhängigkeit (Intelligence-Features wie Multi-Model-Routing werden in Monat 2 gebaut, aber erst in Monat 4 production-gehärtet). Beide Perspektiven sind korrekt — sie beschreiben verschiedene Achsen desselben Plans.

---

## 13. Abschlussrechnung {#rechnung}

### Implementation Doktorarbeit

| Dokument | Zeilen |
|----------|--------|
| IR-1: Claude Code Mastery | 1.051 |
| IR-2: Multi-Agent Development | 1.232 |
| IR-3: Testing & Quality für AI | 1.690 |
| IR-4: AI Development Process | 1.233 |
| IR-5: H2A Skill & Hook Architecture | 1.346 |
| IR-6: Implementation Blueprint | 1.381 |
| IR-7: DevOps, MLOps & AI Infrastructure | 1.230 |
| Master-Index | 152 |
| **Implementation Manifest (dieses Dokument)** | **~1.000** |
| **GESAMT Implementation** | **~10.315** |

### Beide Doktorarbeiten zusammen

| Dimension | Product (WAS) | Implementation (WIE) | **Gesamt** |
|-----------|---------------|---------------------|------------|
| Dokumente | 19 | 9 | **28** |
| Zeilen | 16.856 | ~10.315 | **~27.171** |
| Seiten (~) | 560 | 343 | **~903** |
| Expert Panel | 11/11 ✅ | 12/12 ✅ | **23/23** |
| Deep Research | 10 | 7 | **17** |
| Gurus zitiert | 15+ | 12+ | **20+** |

**~27.171 Zeilen — ~903 Seiten — die umfassendste Referenz für einen AI-first Customer Platform Agent in der Automobilindustrie.**

---

## 14. Epilog {#epilog}

### Die Vision

> *"H2A ist nicht ein Chatbot. H2A ist der digitale Concierge, der jeden Mercedes-Benz Kunden kennt, versteht und begleitet — über jeden Touchpoint, über jede Phase der Beziehung."*

### Warum jetzt?

2026 ist das Jahr, in dem alle Bausteine zusammenkommen:

- **LLMs** sind zuverlässig genug für Enterprise (Hallucination < 2% mit Guardrails)
- **Tool Use** macht Chatbots zu Agents (Bedrock Converse API, 5-round Loops)
- **Claude Code** macht 1 PO so produktiv wie ein Dev-Team (Skills + Hooks + Multi-Agent)
- **Passkeys** eliminieren Login-Friction (99% Success Rate, < 1 Sekunde)
- **SSE Streaming** liefert Echtzeit-Erlebnisse (< 2s TTFT)
- **Nexus Gateway** gibt Mercedes-Benz State-of-the-Art LLMs (Compliance-konform)

### Was diese Doktorarbeit leistet

28 Dokumente, ~27.171 Zeilen, ~903 Seiten. Kein akademisches Papier — ein **ausführbarer Blueprint**.

**Die Doktorarbeit beantwortet:**
- **WAS** bauen? → 19 Dokumente, 10 Deep Research, 11/11 Panel
- **WIE** bauen? → 9 Dokumente, 7 Implementation Research, 12/12 Panel
- **WANN** bauen? → 16-Wochen-Blueprint, 4 Phasen, klare Gates
- **WAS KOSTET** es? → ~$53.300/Jahr, Betriebs-ROI > 3.000% (Produkt-ROI: 729%, Dev-Cost-ROI: 8.337%)
- **WAS KANN SCHIEFGEHEN?** → 10 Risiken mit Mitigations

### Der nächste Schritt

```
Woche 0, Tag 1:
  $ /nexus-test
  → "Nexus Gateway erreichbar. Bedrock Converse API: ✅"
  → "Model claude-sonnet-4-6: ✅"
  → "Latenz: 1.2s"
  
  → Phase 1 kann beginnen.
```

---

*"Between the idea and the reality, between the motion and the act, falls the shadow."*
*— T.S. Eliot*

*"Unless your AI agents bridge that gap — with Skills as their playbook, Hooks as their guardrails, and Golden Tests as their conscience."*
*— H2A Implementation Manifest, 2026*

---

**Manifest v3.0 — Genehmigt: 2026-09-26**
**Expert Panel: 12/12 APPROVED ✅**
**Nächster Review: Nach Sprint 1 (Woche 4)**
**Autor: Philipp Dangelmaier, Product Owner H2A**
**Companion: H2A Product Doktorarbeit (16.856 Zeilen, docs/research/)**

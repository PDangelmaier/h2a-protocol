# Deep Research: Claude Code Mastery & AI-Assisted Development

**Wie man Claude Code optimal nutzt, um das komplexeste AI-Plattform-Projekt der Automobilbranche zu bauen.**

*State of the Art — Skills, Hooks, MCP, Agent Orchestration, Workflows, Gurus, Tools & Startups*

---

## Inhaltsverzeichnis

1. [Claude Code Skills — Architektur & Best Practices](#1-skills)
2. [Hooks — Das Nervensystem](#2-hooks)
3. [MCP Server — Die Superkraft](#3-mcp)
4. [Agent Orchestration — Multi-Agent Development](#4-orchestration)
5. [Workflows & Automation](#5-workflows)
6. [Die Gurus der AI-Assisted Development](#6-gurus)
7. [Die besten Tools & Startups](#7-tools)
8. [H2A-spezifische Claude Code Strategie](#8-h2a)
9. [Konkrete Empfehlungen & Roadmap](#9-empfehlungen)

---

## 1. Claude Code Skills — Architektur & Best Practices {#1-skills}

### 1.1 Anatomie eines Skills

Ein Skill ist die kleinste wiederverwendbare Einheit in Claude Code. Er besteht aus:

```
skills/
  my-skill/
    SKILL.md          # Hauptdatei — Frontmatter + Instruktionen
    references/       # Optional: Referenzdateien die geladen werden
    templates/        # Optional: Code-Templates
```

**SKILL.md Frontmatter:**
```yaml
---
name: my-skill
description: "Kurzbeschreibung — wird für Trigger-Matching verwendet"
---
```

Die `description` ist entscheidend: Claude Code matched User-Input gegen diese Beschreibung, um zu entscheiden, ob der Skill automatisch getriggert wird. Eine präzise, keyword-reiche Description erhöht die Trefferquote.

**Instruktions-Body:**
Der Body nach dem Frontmatter enthält die vollständigen Instruktionen. Best Practices:
- **Checklisten** statt Prosa — Claude Code arbeitet Punkt für Punkt ab
- **Explizite Gate-Bedingungen** — "STOP und warte auf User-Approval bevor du X tust"
- **Anti-Patterns** aufzählen — "NIEMALS X tun" ist effektiver als "Bitte Y tun"
- **Konkrete Beispiele** — ein gutes Beispiel spart 500 Worte Erklärung

### 1.2 Die 4 Skill-Kategorien

| Kategorie | Zweck | Beispiele | Trigger-Pattern |
|-----------|-------|-----------|-----------------|
| **Process** | Steuern den Entwicklungsprozess | brainstorming, review, qa, ship | Am Anfang/Ende eines Workflows |
| **Domain** | Fachspezifisches Wissen | frontend-design, ai-engineer, backend-security | Bei domänenspezifischen Aufgaben |
| **Utility** | Einzelne Aktionen | commit, browse, investigate | Bei konkreten Operationen |
| **Meta** | Skills die Skills erzeugen | skill-development, writing-skills | Selten, nur bei Bedarf |

**Die Hierarchie für H2A:**
```
Process Skills (steuern den Flow)
  └─ Domain Skills (liefern Expertise)
       └─ Utility Skills (führen Aktionen aus)
            └─ Meta Skills (erzeugen neue Skills)
```

### 1.3 Skill-Ketten — Automatische Orchestrierung

Skills können den nächsten Skill im Flow aufrufen. Das Superpowers-Plugin demonstriert das mustergültig:

```
brainstorming → writing-plans → executing-plans → verification-before-completion
```

**Wie es funktioniert:**
1. Skill A endet mit einer Instruktion: "Invoke the writing-plans skill"
2. Claude Code erkennt den Skill-Namen und lädt ihn
3. Der neue Skill hat den Kontext der vorherigen Schritte

**Kritische Regel:** Jeder Skill in der Kette muss einen klaren **Exit-Punkt** und eine klare **Übergabe-Bedingung** haben. Ohne das entstehen Endlosschleifen.

### 1.4 Custom Skills erstellen — Wann lohnt es sich?

**Skill erstellen wenn:**
- Die Aufgabe öfter als 3x vorkommt
- Die Instruktionen mehr als 10 Zeilen umfassen
- Domänenwissen erforderlich ist, das Claude nicht von sich aus kennt
- Eine spezifische Reihenfolge eingehalten werden muss
- Gate-Bedingungen erzwungen werden müssen

**CLAUDE.md reicht wenn:**
- Es eine einfache Regel ist ("Nutze immer ä ö ü ß")
- Es projektweite Constraints sind ("Max 50 Zeilen pro Funktion")
- Es Environment-spezifisch ist ("Bedrock via Nexus, nicht Anthropic Messages API")

**Die Grenze:** Wenn eine CLAUDE.md-Sektion mehr als 30 Zeilen hat und eine spezifische Abfolge beschreibt, sollte sie ein Skill werden.

### 1.5 Skill-Komposition für H2A

Der ideale H2A-Entwicklungs-Skill ist KEIN monolithischer "Super-Skill", sondern ein **Orchestrator** der spezialisierte Sub-Skills aufruft:

```
/h2a-dev (Orchestrator)
  ├── /h2a-context        → Lädt aktuellen Zustand (Branch, offene Issues, DB-Schema)
  ├── /h2a-implement      → Implementierung mit Nexus/Supabase-Kontext
  ├── /h2a-test           → Tests schreiben (Unit + Golden Conversation + E2E)
  ├── /h2a-review         → Code Review mit H2A-spezifischen Regeln
  └── /h2a-deploy         → Supabase Migration + Edge Function Deployment
```

**Warum Komposition statt Monolith:**
- Jeder Sub-Skill kann unabhängig getriggert werden
- Kontext bleibt fokussiert (weniger Tokens, bessere Qualität)
- Einzelne Skills können aktualisiert werden ohne den Rest zu brechen
- Skills können von verschiedenen Workflows wiederverwendet werden

### 1.6 Anti-Patterns bei Skills

| Anti-Pattern | Problem | Lösung |
|-------------|---------|--------|
| **God-Skill** | Ein Skill der alles kann (500+ Zeilen) | In 3-5 fokussierte Skills aufteilen |
| **Implicit Dependencies** | Skill A braucht Output von Skill B, aber sagt es nicht | Explizite Vorbedingungen im Frontmatter |
| **Token-Bloat** | Skill lädt 3000 Zeilen Referenz-Docs | Nur laden was für diese Aufgabe nötig ist |
| **Missing Gates** | Skill implementiert ohne User-Approval | Explizite STOP-Punkte einbauen |
| **Stale Context** | Skill referenziert veraltete File-Pfade | Skill soll dynamisch lesen statt hardcoded |
| **Recursive Skill Calls** | Skill A ruft B, B ruft A | Strikte Hierarchie: Process → Domain → Utility |

---

## 2. Hooks — Das Nervensystem {#2-hooks}

### 2.1 Hook-Architektur

Hooks sind Shell-Scripts die zu bestimmten Zeitpunkten ausgeführt werden. Sie sind das **Immunsystem** des Entwicklungsprozesses — sie schützen vor Fehlern, bevor sie passieren.

**Die 4 Hook-Typen:**

| Hook | Zeitpunkt | Input | Kann blockieren? |
|------|-----------|-------|-----------------|
| **PreToolUse** | VOR einem Tool-Aufruf | Tool-Name, Parameter als JSON | Ja (exit 2) |
| **PostToolUse** | NACH einem Tool-Aufruf | Tool-Name, Ergebnis | Nein |
| **UserPromptSubmit** | VOR der Verarbeitung eines User-Prompts | Prompt-Text | Nein |
| **SessionStart** | Beim Start einer neuen Session | — | Nein |

**Blockierungslogik:**
```bash
# Exit-Codes für PreToolUse
exit 0  # Erlaubt — Tool wird ausgeführt
exit 2  # BLOCKIERT — Tool wird NICHT ausgeführt, User wird informiert
exit 1  # Fehler im Hook — Tool wird trotzdem ausgeführt (fail-open)
```

### 2.2 Gate Hooks — Gefährliche Operationen blockieren

**Destruktive Gate (`destructive-gate.sh`):**
```bash
#!/bin/bash
# Blockiert rm, unlink, > auf .db/.sqlite Dateien
TOOL_NAME="$1"
PARAMS="$2"

if [[ "$TOOL_NAME" == "Bash" ]]; then
  CMD=$(echo "$PARAMS" | jq -r '.command // empty')
  if echo "$CMD" | grep -qE '(rm|unlink|>)\s.*\.(db|sqlite)'; then
    echo "BLOCKED: Destruktive Operation auf Datenbank-Datei"
    exit 2
  fi
fi
exit 0
```

**Dev-Process Gate (`dev-process-gate.sh`):**
Prüft vor `git push`:
1. Welcher Branch? → Bestimmt erforderliche Test-Tiefe
2. Sind alle Tests grün? → Blockiert Push wenn nicht
3. Sind alle Tasks abgeschlossen? → Warnt bei offenen Tasks

### 2.3 Context Injection — Das Geheimnis effizienter Sessions

**Der mächtigste Hook ist `UserPromptSubmit` als Context Injector.** Jeder User-Prompt wird mit Kontext angereichert, BEVOR Claude Code ihn verarbeitet.

Was der `autonomous-context-inject.sh` liefert:
```
=== AUTO-CONTEXT ===
[DEVPROCESS] Offene Tickets: ...
[GIT] Branch: feature/h2a-isp, 3 uncommitted changes
[DB-PROTECT] analytics.db: LOCKED (385MB)
[TASK-GATE] 2 open tasks (L3+)
====================
```

**Warum das brilliant ist:**
- Claude Code hat IMMER den aktuellen Zustand
- Keine "Wo war ich?"-Momente nach Context-Compaction
- Automatische Warnungen (DB geschützt, Tests fehlen etc.)
- Kein manueller Context-Switch nötig

### 2.4 Browser Watcher — Automatisches QA

Der `browser-errors-check.sh` Hook prüft bei jedem Prompt:
1. Ist ein cmux Browser-Tab offen?
2. Gibt es neue JavaScript-Errors?
3. Ist die URL die erwartete? (Redirect = anderes Problem!)
4. Screenshot für visuellen Zustand

**Für H2A kritisch:** Der Agent kommuniziert via SSE-Stream. Browser-Errors können bedeuten:
- SSE-Connection geschlossen (Backend-Problem)
- Frame-Parsing fehlgeschlagen (Protokoll-Fehler)
- React Hydration Error (Frontend-Problem)

### 2.5 Performance-Bewusste Hooks

**Goldene Regel:** Ein Hook der >2 Sekunden dauert, verlangsamt JEDEN Tool-Aufruf.

| Hook-Typ | Max. Dauer | Strategie |
|----------|-----------|-----------|
| PreToolUse | <500ms | Nur Pattern-Matching, keine Netzwerk-Calls |
| PostToolUse | <1s | Async wenn möglich (Hintergrund-Task starten) |
| UserPromptSubmit | <2s | Caching nutzen, nur relevante Checks |
| SessionStart | <5s | Darf länger dauern (nur 1x pro Session) |

### 2.6 Hooks für H2A-Entwicklung

| Hook | Typ | Funktion |
|------|-----|----------|
| `nexus-format-check.sh` | PreToolUse(Write) | Prüft ob Nexus-Requests Bedrock Converse Format nutzen (NICHT Anthropic Messages) |
| `supabase-migration-validator.sh` | PreToolUse(Write) | Validiert SQL-Migrationen bevor sie geschrieben werden |
| `sse-protocol-check.sh` | PostToolUse(Bash) | Prüft SSE-Frame-Format nach dem Testen |
| `h2a-context-inject.sh` | UserPromptSubmit | Injiziert H2A-spezifischen Kontext (Supabase Schema, offene Tools, ISP-Status) |
| `consent-type-guard.sh` | PreToolUse(Write) | Warnt wenn hardcoded Consent-Arrays geschrieben werden |

---

## 3. MCP Server — Die Superkraft {#3-mcp}

### 3.1 Was MCP ist und warum es Game-Changing ist

MCP (Model Context Protocol) ist ein offener Standard von Anthropic, der es Claude Code ermöglicht, mit externen Systemen zu kommunizieren. Statt dass Claude Code nur lesen/schreiben/bash kann, bekommt es durch MCP **Zugang zu beliebigen APIs, Datenbanken und Services**.

**Vor MCP:**
```
Claude Code → Bash → curl → API → parse JSON → verstehen
(6 Schritte, fehleranfällig, manuelles Parsing)
```

**Mit MCP:**
```
Claude Code → MCP Tool → strukturiertes Ergebnis
(2 Schritte, typsicher, nativ integriert)
```

### 3.2 Die besten MCP Server für AI-Entwicklung

#### Serena — LSP-basierte Code Intelligence
**Was es kann:**
- `find_symbol` — Findet Symbole nach Name-Path
- `find_declaration` — Springt zur Definition
- `find_referencing_symbols` — Alle Referenzen eines Symbols
- `get_diagnostics_for_file` — TypeScript-Errors in Echtzeit
- `rename_symbol` — Refactoring über die gesamte Codebase

**Warum es besser ist als grep:**
Serena versteht die SEMANTIK des Codes. `find_referencing_symbols("computePIDScore")` findet auch Re-Exports, Interface-Implementierungen und indirekte Aufrufe — grep findet nur String-Matches.

**Für H2A:** Essentiell für Refactoring des Monorepo (packages/mb-agent, packages/h2a-core, packages/h2a-react). Bei 10+ Dateien die `NexusRequest` importieren, braucht man semantisches Refactoring.

#### Greptile — Code Review mit Org Knowledge
**Was es kann:**
- `list_repositories` — Alle Repos der Organisation
- `list_knowledge_bases` — Generierte Code-Dokumentation
- `search_knowledge_base` — Suche in der Knowledge Base
- `trigger_code_review` — Automatischer Code Review
- `search_greptile_comments` — Frühere Review-Findings durchsuchen

**Für H2A:** Greptile kann MB-interne Code-Standards kennen und in Reviews anwenden. Wenn es Zugang zu mercedes-benz.com Frontend-Repos hat, kann es Konsistenz zwischen H2A-Widget und der bestehenden Website sicherstellen.

#### Context7 — Aktuelle Docs statt Training Knowledge
**Was es kann:**
- `resolve-library-id` — Findet die richtige Library
- `query-docs` — Fragt aktuelle Dokumentation ab

**Warum kritisch für H2A:**
Claude Codes Training-Wissen über Supabase, Bedrock, SSE-APIs ist potentiell veraltet. Context7 liefert die AKTUELLE Dokumentation:
- Supabase Edge Functions Syntax (ändert sich schnell)
- AWS Bedrock Converse API (neue Features)
- React 19 Server Components (falls H2A-Widget darauf migriert)

#### Playwright / Chrome DevTools — Browser Testing
**Zwei Optionen:**
1. **Playwright MCP** — Headless Browser, Navigation, Clicks, Snapshots, Network-Interception
2. **Chrome DevTools MCP** — Verbindung zu laufendem Chrome, Performance-Traces, Lighthouse, Console

**Für H2A:** Das Widget muss auf 7 Kanälen getestet werden. Playwright kann:
- SSE-Streaming testen (Network-Interception)
- Dark/Light Mode prüfen (Media Emulation)
- Mobile-Viewports simulieren (für App/MBUX)
- Accessibility-Audits (Lighthouse)
- Performance-Traces (Core Web Vitals des Widgets)

#### Supabase MCP (FEHLT — muss gebaut werden)
**Was es können sollte:**
- `run_migration` — SQL-Migration ausführen
- `query_table` — Daten abfragen
- `list_edge_functions` — Edge Functions auflisten
- `deploy_function` — Edge Function deployen
- `get_rls_policies` — Row Level Security prüfen

### 3.3 Custom MCP Server für H2A

**Drei Custom MCP Server die H2A braucht:**

#### 1. Nexus Gateway MCP
```
Tools:
- nexus.chat(model, messages, tools)  → Nexus Converse Sync
- nexus.stream(model, messages, tools) → Nexus Converse Stream
- nexus.models()                       → Verfügbare Modelle
- nexus.health()                       → Gateway Status
```
Ermöglicht Claude Code, direkt mit Nexus zu kommunizieren und Responses zu debuggen.

#### 2. Supabase H2A MCP
```
Tools:
- supabase.query(table, filters)       → Daten abfragen
- supabase.migrate(sql)                → Migration ausführen
- supabase.rls_check(table, role)      → RLS-Policy testen
- supabase.seed(table, data)           → Testdaten einfügen
- supabase.edge_deploy(function_name)  → Edge Function deployen
```

#### 3. MB Backend Simulator MCP
```
Tools:
- mb.vehicle_catalog(filters)          → Fahrzeugkatalog
- mb.vehicle_status(vin)               → Fahrzeugstatus
- mb.dealer_search(location, radius)   → Händlersuche
- mb.financing_calculate(params)       → Finanzierungsberechnung
```
Simuliert MB-Backend-APIs für Entwicklung und Testing, ohne echte Backend-Anbindung zu brauchen.

---

## 4. Agent Orchestration — Multi-Agent Development {#4-orchestration}

### 4.1 Fork vs. Fresh Agent

| Aspekt | Fork (`subagent_type: "fork"`) | Fresh Agent (anderer Typ) |
|--------|-------------------------------|---------------------------|
| **Kontext** | Erbt vollständigen Gesprächsverlauf | Startet bei Null |
| **Cache** | Teilt Prompt-Cache (günstig!) | Eigener Cache (teurer) |
| **Wann nutzen** | Wenn Kontext nötig (Code-Kenntnis) | Wenn frische Perspektive nötig (Review) |
| **Beispiel** | "Implementiere die Memory-Extraction" | "Reviewe diesen Code als Externer" |
| **Risiko** | Kann den Kontext des Parents nicht erweitern | Weiß nichts über vorherige Arbeit |

**Für H2A — Faustregel:**
- **Fork** für Implementation (braucht Wissen über Codebase)
- **Fresh** für Review (soll unbefangen bewerten)
- **Fork** für Research (erbt Verständnis des Projekts)
- **Fresh** für Security-Audit (soll unabhängig prüfen)

### 4.2 Workflow Tool — Deterministische Multi-Agent Pipelines

Das Workflow-Tool orchestriert mehrere Agents in einer definierten Pipeline:

```javascript
export const meta = {
  name: 'h2a-implement-feature',
  description: 'Implement H2A feature with architect, coder, tester, reviewer',
  phases: [
    { title: 'Design' },
    { title: 'Implement' },
    { title: 'Test' },
    { title: 'Review' }
  ],
}

const design = await agent(
  `Design die Architektur für: ${args.feature}`,
  { label: 'architect', phase: 'Design', schema: DESIGN_SCHEMA }
)

const implementation = await agent(
  `Implementiere basierend auf diesem Design: ${JSON.stringify(design)}`,
  { label: 'coder', phase: 'Implement' }
)

const tests = await agent(
  `Schreibe Tests für: ${JSON.stringify(implementation.files)}`,
  { label: 'tester', phase: 'Test', schema: TEST_SCHEMA }
)

const review = await agent(
  `Review diesen Code: ${JSON.stringify(implementation.files)}`,
  { label: 'reviewer', phase: 'Review', schema: REVIEW_SCHEMA }
)

return { design, implementation, tests, review }
```

**Vorteile:**
- Deterministische Ausführung (Design VOR Implementation)
- Jeder Agent hat einen klaren Auftrag
- Ergebnisse werden zwischen Agents weitergereicht
- Automatisches Resume bei Unterbrechung

### 4.3 Agent Teams für H2A

**Das ideale H2A Development Team:**

```
┌─────────────────────────────────────────┐
│            PO / Orchestrator            │
│    (Du — der Mensch im Loop)            │
└───────┬───────┬───────┬───────┬─────────┘
        │       │       │       │
   ┌────▼──┐ ┌──▼───┐ ┌▼─────┐ ┌▼───────┐
   │Architect│ │Coder │ │Tester│ │Reviewer │
   │ (Fork) │ │(Fork)│ │(Fork)│ │(Fresh)  │
   └────┬───┘ └──┬───┘ └┬─────┘ └┬───────┘
        │        │      │        │
   Design    Implement  Test    Review
   Schema    Code       Golden  Security
   API       Tests      Conv.   Performance
```

**Spezialisierungen:**

| Agent | Rolle | Skills | Fokus |
|-------|-------|--------|-------|
| **Architect** | Entwirft Architektur | brainstorming, plan-eng-review | Schema, API, Datenfluss |
| **Coder** | Implementiert | execute-plans, careful | TypeScript, Supabase, SSE |
| **Tester** | Testet | qa, test-driven-development | Unit, Golden Conversation, E2E |
| **Reviewer** | Prüft | review, code-review, guard | Security, Performance, Standards |

### 4.4 Worktrees — Isolierte Entwicklung

Git Worktrees ermöglichen parallele Arbeit an verschiedenen Features OHNE Merge-Konflikte:

```
h2a-protocol/                    # Haupt-Worktree (main)
.claude/worktrees/
  ├── h2a-tool-adapter/          # Feature: Tool Adapter Layer
  ├── h2a-consent-live/          # Feature: Live Consent Checking
  └── h2a-memory-extraction/     # Feature: Memory Extraction
```

**Workflow mit Worktrees:**
1. `EnterWorktree` → Neuer Worktree auf Feature-Branch
2. Agent arbeitet isoliert im Worktree
3. Commit & Push aus dem Worktree
4. `ExitWorktree` → Zurück zum Haupt-Repo
5. PR erstellen (aus dem Feature-Branch)

**Für H2A:** Erlaubt parallele Arbeit an den 12 Implementierungslücken, ohne dass ein Agent die Arbeit eines anderen überschreibt.

### 4.5 Die Kunst der Agent-Prompts

**Schlechter Prompt:**
```
"Implementiere Memory Extraction für H2A."
```

**Guter Prompt:**
```
"Implementiere Memory Extraction in packages/mb-agent/src/memory.ts.

KONTEXT: Die Funktion persistMemory() wird aufgerufen, aber newMemories in 
reasoning.ts ist immer leer (Zeile 42). Das Memory-System hat 5 Typen 
(fact, preference, context, relationship, decision) mit Importance 0-1.

AUFGABE: Schreibe eine extractMemories(conversation: Turn[]) Funktion die:
1. Fakten über den Kunden extrahiert (Name, Fahrzeug, Präferenzen)
2. Jeder Memory einen Importance-Score gibt (0-1)
3. Duplikate per semantischem Vergleich erkennt
4. Das Ergebnis als AgentMemory[] zurückgibt

CONSTRAINTS:
- Max 50 Zeilen
- Kein LLM-Call für Extraktion (zu teuer) — Regex + Heuristik
- Bestehende Typen aus types.ts nutzen
- Tests in tests/memory.test.ts ergänzen

NICHT TUN:
- Keine neuen Dependencies
- memory.ts nicht komplett umschreiben, nur extractMemories hinzufügen
- Kein .db Dateien anfassen
"
```

**Die Formel:** KONTEXT + AUFGABE + CONSTRAINTS + NICHT TUN = guter Agent-Prompt.

### 4.6 Fehler-Patterns und Gegenmaßnahmen

| Pattern | Symptom | Gegenmaßnahme |
|---------|---------|---------------|
| **Endlosschleife** | Agent versucht das Gleiche 5x | Bounded Execution (max 3 Iterationen pro Schritt) |
| **Context Overflow** | Agent verliert früheren Kontext | Fork statt endlos in einer Session weiterarbeiten |
| **API-Error Cascade** | Mehrere Agents gleichzeitig → Rate Limit | Sequenzielle statt parallele Execution für API-intensive Tasks |
| **Scope Creep** | Agent "verbessert" Code der nicht im Auftrag war | Explizite NICHT-TUN-Liste im Prompt |
| **Halluzinierte Imports** | Agent importiert nicht-existierende Module | verify-imports.sh Hook + Serena find_symbol |
| **Stale File Refs** | Agent referenziert umbenannte/gelöschte Dateien | Git Status Check im Prompt injizieren |

---

## 5. Workflows & Automation {#5-workflows}

### 5.1 Autonomous Workflow — Die Skill-Kette

Der `/autonomous-workflow` Skill kettet automatisch:

```
/pickup-ticket → /implement → /review → /qa → /ship
```

Jeder Schritt hat:
- **Entry-Bedingung:** Was muss erfüllt sein?
- **Exit-Bedingung:** Was muss das Ergebnis sein?
- **Fallback:** Was passiert bei Fehler?
- **Autonomie-Level:** Darf der Agent selbst entscheiden?

### 5.2 Workflow State Machine

Die State Machine (`workflow-state-machine.sh`) erzwingt den korrekten Flow:

```
context_gathering → ticket_pickup → implementation → review → qa → ship
         │                │                │            │        │
         ▼                ▼                ▼            ▼        ▼
    Kontext lesen    Ticket laden     Code ändern   Prüfen   Deployen
    Branch prüfen    Scope prüfen    Tests schreiben Findings  PR erstellen
    Tests existieren? Abhängigkeiten  Lint/Format    Fixen     Git Push
```

**Übergänge sind validiert:** Man kann nicht von `context_gathering` direkt zu `ship` springen. Jeder Übergang wird im Audit Trail geloggt.

### 5.3 Task Persistence über Sessions

**Problem:** Claude Code Sessions haben endlichen Kontext. Ein komplexes Feature braucht mehrere Sessions.

**Lösung:** `task-manager.sh` persistiert Tasks in JSON:
```json
{
  "id": "TASK-042",
  "subject": "Tool Adapter Layer implementieren",
  "description": "Mock-Responses in tools.ts durch echte MB-API-Calls ersetzen",
  "level": 5,
  "status": "in_progress",
  "created": "2026-09-26T10:00:00Z",
  "context": {
    "files": ["packages/mb-agent/src/tools.ts"],
    "branch": "feature/h2a-tool-adapter",
    "blockers": ["MB-API Credentials fehlen"]
  }
}
```

**Session-Überbrückung:**
1. Session 1: Task erstellen, Implementation starten, Context speichern
2. Session 2: `task-manager.sh list` → sieht offene Tasks → lädt Context → macht weiter

### 5.4 Confidence-Gated Decisions

**Idee (aus dem Paper "Knowing What You Don't Know" — Lin et al. 2022):**
Nicht jede Entscheidung sollte autonom getroffen werden. Das `confidence-tracker.sh` System:

```
Confidence > 0.8  → Automatisch ausführen
Confidence 0.5-0.8 → Ausführen + User informieren
Confidence < 0.5  → User fragen (Escalation)
```

**Kategorien und Schwellenwerte:**
| Kategorie | Auto-Schwelle | Begründung |
|-----------|--------------|------------|
| code_style | 0.6 | Niedrig — Style ist reversibel |
| architecture | 0.8 | Hoch — Architektur ist schwer rückgängig |
| test_strategy | 0.7 | Mittel — Tests sind wichtig aber anpassbar |
| bug_fix | 0.7 | Mittel — Bugs sind dringend aber Fixes können falsch sein |
| api_design | 0.8 | Hoch — API-Änderungen haben Breaking-Change-Potential |
| security | 0.9 | Sehr hoch — Security-Entscheidungen haben große Konsequenzen |

### 5.5 Circuit Breaker — Graceful Degradation

**Problem:** Externe Services (JIRA, GitHub, KB-Agent) können ausfallen. Ein Agent der auf einen ausgefallenen Service wartet, steht still.

**Lösung:** Circuit Breaker Pattern:
```
CLOSED (normal) → Fehler → OPEN (blockiert) → Timeout → HALF_OPEN (testet) → CLOSED
```

**Für H2A:** Wenn Nexus Gateway ausfällt (was bei MB intern vorkommt):
1. Circuit Breaker erkennt 3 aufeinanderfolgende Fehler
2. Schaltet auf OPEN → alle Nexus-Calls werden sofort mit Fallback beantwortet
3. Nach 60 Sekunden → HALF_OPEN → ein Test-Request
4. Wenn erfolgreich → CLOSED → normaler Betrieb

### 5.6 Learning Engine

**Konzept:** Wenn der User korrigiert ("Nein, nicht so"), wird die Korrektur:
1. Im `confidence-tracker` als `incorrect` markiert
2. Im Audit Trail geloggt
3. In der Memory (`MEMORY.md`) als Feedback gespeichert
4. Beim nächsten ähnlichen Fall automatisch berücksichtigt

**Praktisches Beispiel:**
```
User: "Nutze NICHT die Anthropic Messages API, sondern Bedrock Converse!"
Learning Engine:
  → confidence-tracker.sh outcome PRED-123 incorrect
  → Feedback Memory: "Nexus: NICHT Anthropic Messages API, Bedrock Converse format only"
  → Nächste Session: Confidence für api_design bei Nexus-Calls automatisch niedriger
  → → Agent fragt nach statt autonom zu entscheiden
```

---

## 6. Die Gurus der AI-Assisted Development {#6-gurus}

### 6.1 Andrej Karpathy — "Software 3.0"

**Kernthese:** Software-Entwicklung durchläuft drei Epochen:
1. **Software 1.0** — Mensch schreibt explizite Regeln (if/else)
2. **Software 2.0** — Mensch liefert Daten, Maschine lernt Regeln (ML)
3. **Software 3.0** — Mensch beschreibt Intent, LLM generiert Code/Verhalten

**Relevanz für H2A:** Der H2A-Agent IST Software 3.0. Seine "Programmierung" ist der System Prompt (CCP), nicht klassischer Code. Die Personality-Engine ist im Grunde ein LLM-Compiler.

**Karpathys zweite These — "LLM als Operating System":**
Das LLM ist die CPU, Tools sind Peripherie-Geräte, der System Prompt ist das BIOS, und Conversations sind Prozesse. H2A sollte so gedacht werden: Der Agent ist das OS, Nexus-Tools sind Syscalls.

### 6.2 Simon Willison — Pragmatischer LLM-Tooling-Pioneer

**Beiträge:**
- Popularisiert "Prompt Engineering" als Disziplin
- sqlite-utils + datasette — Tools für datengetriebenes Arbeiten
- LLM CLI Tool — Command-Line-Interface für LLMs
- Umfassende Dokumentation über LLM-Sicherheit (Prompt Injection)

**Kernphilosophie:** "Build tools, not frameworks." Kleine, kompositierbare Tools die LLMs erweitern, statt monolithische Frameworks.

**Für H2A:** Willisons Ansatz legitimiert unsere Hook/Script-Architektur. 39 kleine, spezialisierte Scripts sind besser als ein großes Framework.

### 6.3 Chris Lattner (Modular) — AI Infrastructure

**Kernthese:** Die Infrastruktur-Schicht für AI ist noch nicht gebaut. So wie TCP/IP das Internet ermöglichte und Docker Cloud Computing demokratisierte, braucht AI eine eigene Infrastruktur-Revolution.

**Mojo Language:** Lattners Antwort — eine Programmiersprache die Python-Kompatibilität mit C-Performance vereint, speziell für AI-Workloads.

**Relevanz für H2A:** Performance-kritische Teile (Intent Signal Processing, Memory Scoring) könnten von optimierter Infrastruktur profitieren. Aktuell TypeScript, aber die Frage "Was läuft on-device in MBUX?" wird Infrastruktur-Entscheidungen erfordern.

### 6.4 Itamar Friedman (Codium/Qodo) — AI Testing

**Kernthese:** "AI-generated code needs AI-generated tests." Manuelles Testen von AI-generiertem Code ist nicht skalierbar. Die Lösung: AI-getriebene Test-Generierung mit Mutations-Testing.

**Qodo-Approach:**
1. Analysiere den Code semantisch
2. Generiere Testfälle die Edge-Cases abdecken
3. Führe Mutations-Testing durch (verändere Code, prüfe ob Tests es fangen)
4. Iteriere bis Coverage + Mutation Score akzeptabel

**Für H2A:** "Golden Conversation Tests" sind die H2A-spezifische Version dieses Ansatzes. Jede Agent-Antwort braucht Tests — nicht nur Unit-Tests für Funktionen, sondern Conversation-Level-Tests die prüfen ob der Agent korrekt, hilfsbereit und markensicher antwortet.

### 6.5 Thomas Dohmke (GitHub CEO) — AI-First Development

**Vision:** GitHub Copilot wird zum "AI-Native Developer Environment". Die Zukunft ist nicht Code-Completion, sondern Code-Generation auf Basis natürlicher Sprache.

**Copilot Workspace:** Beschreibe ein Feature → Plan → Implementation → Test → PR. Das ist exakt was Claude Code mit Skills macht — aber bei GitHub als Plattform-Feature.

**Relevanz für H2A:** Der Trend zu "Describe → Build" bestätigt unseren Ansatz: Skills als Beschreibung des Entwicklungsprozesses, nicht als Code.

### 6.6 Matt Welsh — "The End of Programming" (2023)

**Provokante These:** Traditionelles Programmieren wird in 30 Jahren nicht mehr existieren. Stattdessen werden Menschen "AI trainieren" statt "Code schreiben".

**Nuancierte Realität (2026):** Programmieren verschwindet nicht, aber die Art ändert sich fundamental:
- **Weniger:** Boilerplate, CRUD, Standard-Patterns
- **Mehr:** System Design, Prompt Engineering, AI Orchestration
- **Gleich:** Debugging, Performance-Optimierung, Security

**Für H2A:** Der H2A-Entwickler der Zukunft schreibt weniger TypeScript und mehr System Prompts, Tool-Definitionen und Evaluation-Metriken.

### 6.7 Swyx (Latent Space) — AI Engineering

**Kernthese:** "AI Engineering" ist eine neue Disziplin — zwischen ML Engineering und Software Engineering. AI Engineers bauen keine Modelle, sie orchestrieren sie.

**Die 3 Ebenen von AI Engineering:**
1. **Prompt Engineering** — Ein LLM korrekt ansprechen
2. **RAG/Tool Engineering** — LLMs mit externen Daten/Fähigkeiten erweitern
3. **Agent Engineering** — Autonome Systeme die planen, ausführen und reflektieren

**Für H2A:** Wir operieren auf allen 3 Ebenen gleichzeitig. CCP ist Prompt Engineering, Tools sind Tool Engineering, der Reasoning Loop ist Agent Engineering.

### 6.8 Harrison Chase (LangChain/LangGraph) — Agent Frameworks

**Kernthese:** Agent-Systeme brauchen State Management. LangGraph (sein neuestes Produkt) modelliert Agents als State Machines mit Nodes und Edges.

**LangGraph-Konzepte übertragen auf H2A:**
```
H2A State Machine:
  loadContext → computeIntelligence → buildNexusRequest → processResponse → persistTurn
  
  Jeder Knoten hat:
  - Input State (ConversationContext)
  - Execution Logic (Funktion)
  - Output State (modifizierter Context)
  - Conditional Edges (z.B. tool_use → nochmal durchlaufen)
```

**Kritik an LangChain (2024-2026):** Zu abstrakt, zu viele Schichten, zu schwer debuggbar. Die Lektion für H2A: Expliziter Code (wie in reasoning.ts) ist besser als Framework-Magic.

---

## 7. Die besten Tools & Startups {#7-tools}

### 7.1 Cursor — AI-First IDE

**Was es kann:**
- Multi-File Editing (Composer) — ändert mehrere Dateien gleichzeitig
- Codebase-Index — versteht das gesamte Projekt
- Chat mit Code-Kontext — Code referenzieren im Dialog
- Tab-Completion — kontextuelle Vorschläge

**Stärken:** Visuelles Editing, intuitive UX, schnelle Iteration.
**Schwächen:** Weniger autonom als Claude Code, kein Hook-System, keine Skills.
**Für H2A:** Gut für UI-Arbeit am Widget (visual), aber Claude Code ist besser für Backend/Agent-Logik (autonom).

### 7.2 GitHub Copilot — Der Marktführer

**Evolution:**
- 2021: Code Completion (Codex)
- 2023: Chat, Workspace Indexing
- 2024: Copilot Workspace (Plan → Implement → PR)
- 2025: Multi-File Editing, Agent Mode
- 2026: Autonome Task-Execution

**Stärken:** Tiefste GitHub-Integration, Enterprise-Features, breite Sprachunterstützung.
**Schwächen:** Weniger autonomie als Claude Code, kein vergleichbares Skill-System.

### 7.3 Cline/Roo Code — Autonomous Coding Agent

**Was es kann:**
- Vollständig autonome Implementierung in VS Code
- Liest Dateien, führt Bash aus, erstellt Commits
- "Plan and Execute" Modus
- Community-getriebene Entwicklung

**Stärken:** Open Source, VS Code Integration, gute Community.
**Schwächen:** Weniger ausgereiftes Permissions-System, keine Enterprise-Features.
**Für H2A:** Interessant als Alternative, aber Claude Code's Skill-System ist reifer.

### 7.4 Devin (Cognition) — Autonomous Software Engineer

**Was es kann:**
- Gesamte Features von Ticket bis PR implementieren
- Eigene Sandbox-Umgebung (Browser, Terminal, Editor)
- Planung, Debugging, Testing autonom
- SWE-bench: 13.86% (erstes Tool das diesen Benchmark geknackt hat)

**Stärken:** Vollständig autonom, eigene Sandbox.
**Schwächen:** Teuer, langsam, nicht für Enterprise-Kunden optimiert, Black-Box.
**Lesson für H2A:** Devins Stärke ist die Isolation (Sandbox). H2A-Agents sollten in Worktrees arbeiten (= unsere Version der Sandbox).

### 7.5 Codex CLI (OpenAI) — Terminal-basierter Agent

**Was es kann:**
- Terminal-basierte Interaktion (wie Claude Code)
- Sandbox-Execution (Docker)
- Multi-File Editing
- GPT-5 als Backend

**Vergleich mit Claude Code:**
| Feature | Claude Code | Codex CLI |
|---------|------------|-----------|
| Skills | 47+ Skills, custom | Keine |
| Hooks | 4 Hook-Typen, custom | Keine |
| MCP | Beliebige MCP Server | Keine |
| Worktrees | Native Support | Docker Sandbox |
| Agent Orchestration | Fork, Workflow, Teams | Sequentiell |
| IDE Integration | VS Code, JetBrains | Terminal only |

### 7.6 Replit Agent — Full-Stack from Prompt

**Was es kann:**
- Beschreibe eine App → Agent baut sie komplett
- Hosting inklusive (Replit)
- Datenbank, Auth, Frontend, Backend — alles aus einem Prompt
- Rapid Prototyping in Minuten

**Stärken:** Extrem schnelles Prototyping, alles integriert.
**Schwächen:** Vendor Lock-in, nicht Enterprise-fähig, begrenzte Kontrolle.
**Für H2A:** Irrelevant für Production, aber gut für Quick Prototypes ("Wie könnte der Smart Storefront aussehen?").

### 7.7 Bolt.new / v0.dev — Prompt-to-App

**Bolt.new (StackBlitz):**
- Browser-basiert, generiert Full-Stack Apps
- Nuxt, React, Svelte, Vue etc.
- Hot-Reload im Browser
- Vercel-Deployment

**v0.dev (Vercel):**
- UI-Komponenten aus Beschreibung
- shadcn/ui Komponenten
- React/Next.js fokussiert
- Copy-paste-ready Code

**Für H2A:** v0.dev ist relevant für das Widget-Design. Man könnte die Widget-Varianten (Dark Mode, Compact, Fullscreen) als v0-Prompts beschreiben und die generierten Komponenten als Startpunkt nutzen.

### 7.8 Vergleich: Claude Code vs. Alle Anderen

| Dimension | Claude Code | Cursor | Copilot | Devin | Codex |
|-----------|------------|--------|---------|-------|-------|
| **Autonomie** | ★★★★★ | ★★★ | ★★★ | ★★★★★ | ★★★★ |
| **Kontrolle** | ★★★★★ | ★★★★ | ★★★★ | ★★ | ★★★ |
| **Skills/Workflows** | ★★★★★ | ★ | ★★ | ★ | ★ |
| **MCP Integration** | ★★★★★ | ★★ | ★★ | ★ | ★ |
| **Enterprise** | ★★★★ | ★★★ | ★★★★★ | ★★★ | ★★★★ |
| **Visual UX** | ★★ | ★★★★★ | ★★★★ | ★★★ | ★★ |
| **Team-Features** | ★★★ | ★★★ | ★★★★★ | ★★ | ★★ |
| **Kosten-Effizienz** | ★★★★ | ★★★★ | ★★★★★ | ★★ | ★★★ |

**Claude Code gewinnt bei:** Autonomie + Kontrolle (Skills, Hooks, MCP). 
**Claude Code verliert bei:** Visual UX (kein IDE), Team-Collaboration (kein gemeinsamer Server).

**Fazit:** Für H2A ist Claude Code die beste Wahl, weil:
1. Das Skill-System erlaubt projektspezifische Workflows
2. Hooks schützen vor Enterprise-Risiken (DB-Schutz, API-Format)
3. MCP ermöglicht Integration mit MB-Systemen
4. Agent Orchestration skaliert mit Projektkomplexität

---

## 8. H2A-spezifische Claude Code Strategie {#8-h2a}

### 8.1 Neue Skills für H2A

| Skill | Trigger | Funktion |
|-------|---------|----------|
| `/h2a-context` | Automatisch bei Session-Start | Lädt H2A-Zustand: Schema, offene Tools, aktuelle Personality-Config |
| `/h2a-implement` | "implementiere", "baue", "erstelle" + H2A | Implementierung mit Nexus/Supabase-Kontext und Anti-Halluzinations-Guards |
| `/h2a-test` | "teste", "test", "prüfe" + H2A | Golden Conversation Tests + Unit Tests + SSE-Stream Tests |
| `/h2a-golden-conv` | "golden conversation", "konversationstest" | Erstellt und führt Golden Conversation Tests aus |
| `/h2a-deploy` | "deploy", "release" + H2A | Supabase Migration + Edge Function Deployment + Smoke Test |
| `/h2a-personality` | "personality", "CCP", "persona" | CCP-Personality erstellen/testen mit 9-Layer-Preview |
| `/h2a-tool` | "tool erstellen", "neues tool" | Neues Agent-Tool erstellen inkl. Consent-Check + PID-Filter |
| `/h2a-nexus-debug` | "nexus", "bedrock", "stream" | Nexus-Request debuggen (Format-Check, Response-Parsing, Error-Analyse) |

### 8.2 Hooks für H2A

| Hook | Typ | Funktion |
|------|-----|----------|
| `h2a-nexus-format.sh` | PreToolUse(Write) | Wenn Dateien in `packages/mb-agent/src/nexus.ts` geschrieben werden: Prüft Bedrock Converse Format |
| `h2a-consent-guard.sh` | PreToolUse(Write) | Warnt wenn `['ai_personalization']` hardcoded wird (statt Live-Check) |
| `h2a-migration-check.sh` | PreToolUse(Write) | Validiert SQL-Syntax bevor Migrations-Dateien geschrieben werden |
| `h2a-type-safety.sh` | PostToolUse(Bash) | Nach `tsc --noEmit`: Prüft H2A-spezifische Type-Constraints |
| `h2a-tool-definition.sh` | PreToolUse(Write) | Wenn neue Tools in tools.ts hinzugefügt werden: Prüft ob alle Required Fields da sind |

### 8.3 Fehlende MCP Server

| MCP Server | Priorität | Funktion |
|------------|----------|----------|
| **Supabase MCP** | KRITISCH | Direkte DB-Operationen, Migration-Management, RLS-Testing |
| **Nexus Gateway MCP** | HOCH | Nexus-Requests direkt senden, Responses debuggen, Model-Listing |
| **MB Backend Simulator MCP** | HOCH | Mock-APIs für Fahrzeugkatalog, Händlersuche, Finanzierung |
| **SSE Debug MCP** | MITTEL | SSE-Streams aufzeichnen, Frame-by-Frame analysieren |
| **Langfuse MCP** | MITTEL | Traces aus Langfuse abrufen, Performance-Metriken analysieren |

### 8.4 Das Agent Team für H2A

**Sprint-basierte Orchestrierung:**

```
Sprint Planning (PO = Du)
  │
  ├── Phase 1: Design (1 Architect-Agent)
  │   └── API Design, Schema Changes, Interface Definitions
  │
  ├── Phase 2: Implement (2-3 Coder-Agents parallel in Worktrees)
  │   ├── Agent 1: Backend (mb-agent Package)
  │   ├── Agent 2: Frontend (h2a-react Package)
  │   └── Agent 3: Supabase (Migrations, Edge Functions)
  │
  ├── Phase 3: Test (1-2 Tester-Agents)
  │   ├── Agent 1: Unit + Golden Conversation
  │   └── Agent 2: E2E + Browser
  │
  └── Phase 4: Review (1 Fresh Reviewer-Agent)
      └── Security, Performance, MB-Standards, Code Quality
```

### 8.5 Optimale Entwicklungsreihenfolge

Die 12 Implementierungslücken, priorisiert nach Abhängigkeiten:

```
Sprint 1 (Fundament):
  [1] Tool Adapter Layer (KRITISCH — alles andere hängt davon ab)
  [2] Consent-Prüfung live (KRITISCH — DSGVO-Pflicht)

Sprint 2 (Intelligence):
  [3] Memory Extraction (HOCH — macht den Agent schlauer)
  [6] Journey-Phase-Erkennung (HOCH — bestimmt Proactivity)
  [9] Composite Intent Signals (MITTEL — verfeinert ISP)

Sprint 3 (Reliability):
  [4] Fallback-Modell (HOCH — Resilience)
  [8] Multi-Model-Routing (MITTEL — Kostenoptimierung)
  [11] Rate Limiting (MITTEL — Security)

Sprint 4 (Experience):
  [5] Identity Nudge Layer (HOCH — Conversion)
  [10] Identity Merge (MITTEL — UX)
  [7] Session Timeout (MITTEL — Cleanup)
  [12] Quality Gates (MITTEL — Ops)
```

---

## 9. Konkrete Empfehlungen & Roadmap {#9-empfehlungen}

### 9.1 Sofort-Maßnahmen (Woche 1)

| # | Maßnahme | Aufwand | Impact |
|---|---------|---------|--------|
| 1 | `/h2a-context` Skill erstellen | 2h | Jede Session startet mit vollständigem Kontext |
| 2 | `h2a-nexus-format.sh` Hook einrichten | 1h | Verhindert Bedrock-Format-Fehler |
| 3 | `h2a-consent-guard.sh` Hook einrichten | 1h | Verhindert hardcoded Consent |
| 4 | H2A-CLAUDE.md in `packages/mb-agent/` anlegen | 2h | Projektspezifische Regeln für Agents |
| 5 | Worktree-Workflow für die 12 Implementierungslücken planen | 1h | Parallele Entwicklung vorbereiten |

### 9.2 Kurzfristige Maßnahmen (Woche 2-4)

| # | Maßnahme | Aufwand | Impact |
|---|---------|---------|--------|
| 6 | Supabase MCP Server bauen (oder Community-Version finden) | 8h | Direkte DB-Operationen |
| 7 | `/h2a-test` Skill mit Golden Conversation Framework | 4h | AI-spezifisches Testing |
| 8 | `/h2a-tool` Skill für neue Agent-Tools | 4h | Standardisierte Tool-Erstellung |
| 9 | Nexus Gateway MCP Prototype | 8h | Direkte Nexus-Kommunikation |
| 10 | Sprint 1 starten (Tool Adapter + Consent) | 40h | Die 2 kritischsten Lücken schließen |

### 9.3 Mittelfristige Maßnahmen (Monat 2-3)

| # | Maßnahme | Aufwand | Impact |
|---|---------|---------|--------|
| 11 | MB Backend Simulator MCP | 16h | Entwicklung ohne echte Backends |
| 12 | Workflow-Template für H2A Feature Development | 8h | Deterministische Agent-Pipelines |
| 13 | Confidence-Tracking für H2A-Architektur-Entscheidungen | 4h | Bessere Autonomie-Kalibrierung |
| 14 | Sprint 2 + 3 (Intelligence + Reliability) | 80h | 7 weitere Lücken schließen |
| 15 | E2E Test Suite mit SSE-Stream-Testing | 16h | Vollständige Test-Coverage |

### 9.4 Langfristige Vision (Monat 4-6)

| # | Maßnahme | Aufwand | Impact |
|---|---------|---------|--------|
| 16 | Self-Improving Agent: Learning Engine für H2A | 40h | Agent lernt aus Konversationen |
| 17 | Multi-Agent-Workflow für Full Feature Development | 24h | Architect → Coder → Tester → Reviewer automatisch |
| 18 | H2A Development Dashboard | 16h | Visualisiert Agent-Performance, Kosten, Quality |
| 19 | Sprint 4 (Experience) | 40h | Letzte 4 Lücken schließen |
| 20 | Greptile Integration für Cross-Repo Reviews | 8h | MB-weite Code-Standards in Reviews |

### 9.5 Der optimale Entwicklungstag mit Claude Code

```
09:00  Session starten
       → SessionStart Hook: Audit Trail, Kontext-Check
       → /h2a-context: Schema, offene Tasks, Git Status laden
       
09:05  Task auswählen
       → task-manager.sh list → offene Tasks sehen
       → /pickup-ticket oder manuell Task wählen
       
09:10  Implementierung
       → EnterWorktree für isolierte Arbeit
       → Fork-Agents für parallele Sub-Tasks
       → Hooks schützen vor Fehlern (Nexus-Format, Consent, DB)
       
11:00  Tests
       → /h2a-test: Unit + Golden Conversation
       → Playwright Browser Test (Widget)
       
11:30  Review
       → /review mit H2A-spezifischen Regeln
       → Fresh Agent für unabhängigen Security Review
       
12:00  Ship
       → /ship: Commit, PR, Deploy
       → Browser-Check nach Deploy
       → Task als completed markieren
       
12:15  Nächster Task oder Session Ende
       → task-manager.sh list → nächster Task
       → Oder: /save-learnings + Session beenden
```

### 9.6 Metriken für den Erfolg

| Metrik | Ziel | Messung |
|--------|------|---------|
| **Features/Woche** | 2-3 Lücken pro Sprint (2 Wochen) | Task Completion Rate |
| **Test Coverage** | >80% Lines, >90% Golden Conversations | Coverage Report |
| **Agent Autonomy** | 70% der Entscheidungen autonom (L1-L4) | Confidence Tracker |
| **Error Rate** | <5% der Commits brauchen Hotfix | Git History |
| **Session Efficiency** | >3 Tasks pro Session | Audit Trail |
| **Hook Block Rate** | >95% der gefährlichen Ops werden gecatcht | Hook Logs |

---

## Anhang A: Referenzen & weiterführende Quellen

### Papers & Publikationen
- Karpathy, A. "Software 2.0" (2017), "Software 3.0" (2024)
- Welsh, M. "The End of Programming" (2023, CACM)
- Lin, Z. et al. "Teaching Models to Express Their Uncertainty in Words" (2022)
- Park, J.S. et al. "Generative Agents" (2023, Stanford/Google)
- Anthropic. "Building Effective Agents" (2025)
- Andrew Ng. "Agentic Design Patterns" (DeepLearning.AI, 2024)

### Blogs & Podcasts
- Simon Willison Blog (simonwillison.net) — LLM-Tools, Prompt Injection
- Latent Space Podcast (Swyx) — AI Engineering
- Harrison Chase Blog — LangChain/LangGraph
- Anthropic Research Blog — Claude Architecture, Safety

### Tools & Dokumentation
- Claude Code Documentation (docs.anthropic.com)
- MCP Specification (modelcontextprotocol.io)
- Supabase Docs (supabase.com/docs)
- AWS Bedrock Converse API (docs.aws.amazon.com)

---

## Anhang B: Glossar

| Begriff | Definition |
|---------|-----------|
| **Skill** | Wiederverwendbare Claude Code Instruktions-Einheit (SKILL.md) |
| **Hook** | Shell-Script das zu bestimmten Zeitpunkten ausgeführt wird |
| **MCP** | Model Context Protocol — offener Standard für Tool-Integration |
| **Fork** | Subagent der den Kontext des Parents erbt |
| **Worktree** | Git Worktree — isolierte Kopie des Repos für parallele Arbeit |
| **Circuit Breaker** | Pattern das kaskadierende Fehler verhindert |
| **Golden Conversation** | Test der eine komplette Agent-Konversation prüft |
| **CCP** | Contextual Conversation Personality — 9-Layer System Prompt |
| **ISP** | Intent Signal Processing — 22 gewichtete Signale |
| **PID Score** | 0-100 Identitäts-Score mit 5 Tiers |
| **Nexus** | Mercedes-Benz Multi-Cloud LLM Gateway (Bedrock Converse API) |

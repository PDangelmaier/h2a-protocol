# TAD: H2A Protocol — Technical Architecture Document

**Version:** 1.0
**Created:** 2026-04-24
**Author:** Philipp Dangelmaier

---

## 1. System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        H2A Ecosystem                         │
│                                                              │
│  ┌─────────────┐  ┌────────────┐  ┌────────────────────┐   │
│  │ @h2a/core   │  │ @h2a/react │  │ @h2a/test-suite    │   │
│  │ TS Client + │  │ React SDK  │  │ Conformance Tests  │   │
│  │ Server Base │  │ Hooks/Comp │  │ 3 Levels           │   │
│  └──────┬──────┘  └─────┬──────┘  └─────────┬──────────┘   │
│         │               │                    │              │
│  ┌──────┴───────────────┴────────────────────┘              │
│  │                    Spec v0.2                              │
│  │  Messages · Transport · Presence · Security · A11y       │
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────┐  ┌────────────┐  ┌────────────────────┐   │
│  │ h2a-python  │  │ Adapters   │  │ H2A Playground     │   │
│  │ FastAPI     │  │ LangGraph  │  │ Interactive Web    │   │
│  │ Server SDK  │  │ CrewAI     │  │ Protocol Explorer  │   │
│  └─────────────┘  │ Vercel     │  └────────────────────┘   │
│                    └────────────┘                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ H2A Mock Agent — Deterministic, no LLM required      │   │
│  │ Scenarios: echo, slow-stream, orchestrate, error     │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## 2. Package Architecture

### 2.1 Monorepo Layout

```
h2a-protocol/
├── spec/
│   ├── h2a-spec-v0.2.md              ← Spec (aktualisiert)
│   ├── h2a-conformance-levels.md
│   ├── h2a-security-addendum.md
│   ├── h2a-test-vectors.md
│   ├── h2a-voice-extension.md
│   ├── h2a-agui-alignment.md         ← NEU: AG-UI Diff
│   ├── h2a-cddl.cddl                ← NEU: Formal Grammar
│   └── schema/
│       ├── agent-card.schema.json
│       ├── messages.schema.json
│       ├── orchestration-policy.schema.json
│       └── health-check.schema.json
├── packages/
│   ├── core/                          ← @h2a/core (TypeScript)
│   │   ├── src/
│   │   │   ├── types.ts              ← Alle H2A Message Types
│   │   │   ├── transport.ts          ← SSE Client (Host-side)
│   │   │   ├── server.ts             ← SSE Server (Agent-side) ← NEU
│   │   │   ├── validate.ts           ← JSON Schema Validation
│   │   │   ├── sanitize.ts           ← Content Sanitization
│   │   │   ├── presence.ts           ← Presence State Machine ← NEU
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── react/                         ← @h2a/react ← NEU
│   │   ├── src/
│   │   │   ├── H2AProvider.tsx
│   │   │   ├── useH2A.ts
│   │   │   ├── usePresence.ts
│   │   │   ├── H2AChat.tsx
│   │   │   ├── PresenceIndicator.tsx
│   │   │   └── index.ts
│   │   └── package.json
│   ├── python/                        ← h2a-python (PyPI)
│   │   ├── h2a/
│   │   │   ├── types.py
│   │   │   ├── agent.py
│   │   │   ├── validate.py
│   │   │   └── fastapi_integration.py
│   │   └── pyproject.toml
│   ├── mock-agent/                    ← @h2a/mock-agent ← NEU
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── scenarios.ts
│   │   │   └── cli.ts
│   │   └── package.json
│   └── test-suite/                    ← @h2a/test-suite
│       ├── src/
│       │   ├── tests.ts
│       │   ├── runner.ts
│       │   └── index.ts
│       └── package.json
├── adapters/                          ← NEU
│   ├── langgraph/
│   ├── crewai/
│   └── vercel-ai/
├── playground/                        ← NEU
│   ├── src/
│   └── package.json
└── docs/
    ├── PRD-h2a-v1.md
    ├── TAD-h2a-v1.md
    ├── sprint-plan.md
    ├── competitive-positioning.md
    ├── gap-analysis-v0.1.md
    └── open-challenges.md
```

### 2.2 Dependency Graph

```
@h2a/test-suite ──→ @h2a/core
@h2a/react ────────→ @h2a/core
@h2a/mock-agent ───→ @h2a/core
playground ────────→ @h2a/react + @h2a/mock-agent
h2a-python ────────→ (independent, same spec)
adapters/* ────────→ @h2a/core + framework-specific
```

## 3. Core Protocol Decisions

### 3.1 Transport

**Primary:** SSE + HTTP POST (wie MCP)
- Host → Agent: POST /h2a/session, POST /h2a/signal
- Agent → Host: SSE Stream

**Why SSE over WebSocket:**
- Simpler (uni-directional stream + HTTP requests)
- Better proxy/CDN support
- Proven by MCP ecosystem
- WebSocket als Alternative spezifiziert, nicht als Default

### 3.2 Message Format

All messages are JSON. No binary protocol in v1.0.
Every message has `type` discriminator:
- `session.open`, `session.ack`, `session.resume`
- `state.snapshot`, `state.diff`
- `agent.frame` (with `frameType` sub-discriminator)
- `user.signal` (with `signalType` sub-discriminator)
- `presence.update`

### 3.3 Frame Types (v0.2 update)

| frameType | Purpose | AG-UI Equivalent |
|-----------|---------|------------------|
| `text` | Streamed text | TextMessageStart/Content/End |
| `tool_card` | Tool invocation UI | ToolCallStart/Args/End |
| `confirmation` | Human approval | — (H2A unique) |
| `progress` | Long-running status | StepStarted/StepFinished |
| `state_delta` | UI manipulation | StateSnapshotDelta |
| `toast` | Non-blocking notification | — (H2A unique) |
| `artifact` | File/structured output | — (partially via custom) |
| `component` | Custom UI extension | Custom events |
| `error` | Error reporting | RunError |
| `end` | Response complete | RunFinished |

### 3.4 Presence State Machine

```
                 ┌────────────────────────────────┐
                 │                                │
    ┌────────────┴─┐    detect    ┌────────────┐  │
    │     REST     │────────────→│  ATTENTIVE  │  │
    │  (passive)   │←────────────│  (noticed)  │──┘
    └──────────────┘   timeout   └──────┬──────┘
           ↑                           │ engage
           │ complete/dismiss          ↓
    ┌──────┴──────────────────┐ ┌──────────────┐
    │     ORCHESTRATING       │←│  CONVERSING  │
    │  (acting on UI)         │ │  (dialogue)  │
    └─────────────────────────┘ └──────────────┘
```

Transitions are event-driven, not timer-driven. The Agent controls transitions.
The Host renders the visual representation.

### 3.5 Security Architecture

**Three layers:**

1. **Transport Security** — TLS 1.3 required, CORS headers
2. **Session Security** — Server-generated session IDs (128-bit), token binding
3. **Content Security** — Frame sanitization, state_delta sandboxing

**OrchestrationPolicy (Host-enforced):**
```json
{
  "allowedOperations": ["fill", "navigate", "click"],
  "navigationScope": "same-origin",
  "requireConfirmation": ["submit", "delete"],
  "maxOperationsPerFrame": 20,
  "rateLimitPerMinute": 100
}
```

### 3.6 Accessibility Architecture

**Normative Requirements:**
- Every frame type maps to an ARIA role (spec §9.3)
- Focus management protocol for confirmation frames
- Streaming text debounced for screen readers (500ms buffer)
- `reducedMotion` disables all Presence animations
- Voice-Only mode as first-class transport (v0.3)

### 3.7 Privacy Architecture

**Data Flow:**
```
Host ──StateSnapshot──→ Agent
  │                       │
  │ allowlist filter       │ projection filter
  │ (Host controls)        │ (Agent declares needs)
  │                       │
  └───── MINIMUM DATA ────┘
```

GDPR Endpoints (Agent-side):
- `GET /h2a/data-export/{userId}`
- `DELETE /h2a/data/{userId}`
- `GET /h2a/data-policy`

## 4. H2A Cockpit Integration Architecture

### 4.1 Current State (scripted demo)

```
DemoPage → CHAT_SCRIPT[] → ChatBubble (plain strings)
                           No protocol, no types, no transport
```

### 4.2 Target State (H2A native)

```
DemoPage → H2AProvider → H2AClient (@h2a/core)
               │              │
               │              ├──→ POST /h2a/session → MockAgent
               │              ├──← SSE: AgentFrame (text, streaming)
               │              ├──← SSE: PresenceUpdate
               │              └──← SSE: AgentFrame (end)
               │
               ├── useH2A() → frames, presence, session state
               ├── usePresence() → breathing animation state
               └── H2AChat → renders AgentFrames by type
```

The Cockpit becomes the first real H2A Host implementation.
The Mock Agent becomes the first real H2A Agent implementation.
Together they prove the protocol works end-to-end.

## 5. Testing Strategy

### 5.1 Test Levels

| Level | Scope | Tool |
|-------|-------|------|
| Unit | Message parsing, validation, sanitization | Vitest |
| Protocol | Full message exchange sequences | @h2a/test-suite |
| Integration | Client + Server over real SSE | @h2a/mock-agent |
| Conformance | All MUST/SHOULD per conformance level | @h2a/test-suite |
| E2E | Cockpit → MockAgent full flow | Playwright |

### 5.2 Conformance Matrix

```
For each conformance level (Basic, Standard, Full):
  For each MUST requirement:
    - Positive test (correct behavior)
    - Negative test (graceful failure)
    - Edge case (boundary conditions)
```

Expected: ~150 test cases for Full conformance.

## 6. Build & Publish Pipeline

### 6.1 Monorepo Tooling

- **Package Manager:** pnpm workspaces
- **Build:** tsup (for all TS packages)
- **Test:** Vitest (unit + integration)
- **Lint:** Biome
- **Schema Validation:** ajv (for JSON Schema)
- **Publish:** Changesets + GitHub Actions → npm

### 6.2 CI Matrix

```yaml
jobs:
  test:
    matrix:
      node: [20, 22]
      package: [core, react, mock-agent, test-suite]
    steps:
      - pnpm install
      - pnpm --filter $package build
      - pnpm --filter $package test
  
  conformance:
    needs: test
    steps:
      - Start mock-agent
      - Run test-suite against mock-agent
      - Report conformance level achieved
  
  publish:
    if: tag matches 'v*'
    steps:
      - pnpm publish --filter @h2a/*
```

## 7. Technology Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Language (primary) | TypeScript | Largest AI/web ecosystem |
| Language (secondary) | Python | Largest AI/ML ecosystem |
| Transport default | SSE + HTTP | Proven by MCP, simple |
| Schema format | JSON Schema Draft 2020-12 | Industry standard |
| Formal grammar | CDDL (RFC 8610) | Used by IETF, compact |
| Monorepo | pnpm workspaces | Fast, disk-efficient |
| Build | tsup | Fast, zero-config ESM/CJS |
| Test | Vitest | Fast, ESM native |
| Validation | ajv | Fastest JSON Schema validator |

## 8. Open Technical Decisions

| ID | Question | Options | Decision |
|----|----------|---------|----------|
| TD-1 | Binary frames for audio? | MessagePack / Protobuf / CBOR | Deferred to v0.3 (Voice) |
| TD-2 | Agent Registry format? | Custom / OCI / npm-like | Deferred to v1.1 |
| TD-3 | Multi-human sessions? | Same session / linked sessions | Deferred to v0.3 |
| TD-4 | Version negotiation protocol? | Downgrade / Reject / Redirect | v0.2: minimum-of-two |

---

*Dieses Dokument definiert die technische Architektur für H2A v1.0.*

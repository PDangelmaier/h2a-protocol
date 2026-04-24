# H2A Protocol Specification — v0.1 (Draft)

**Human-to-Agent Interaction Protocol**

| Field | Value |
|-------|-------|
| Version | 0.1.0-draft |
| Date | 2026-04-20 |
| Authors | PDangelmaier |
| Status | Draft |
| License | MIT |

---

## Table of Contents

1. [Naming Decision](#1-naming-decision)
2. [Problem Statement](#2-problem-statement)
3. [Design Principles](#3-design-principles)
4. [Protocol Overview](#4-protocol-overview)
5. [Core Primitives](#5-core-primitives)
6. [Transport Layer](#6-transport-layer)
7. [Presence System](#7-presence-system)
8. [Security Model](#8-security-model)
9. [Accessibility](#9-accessibility)
10. [Privacy & Consent](#10-privacy--consent)
11. [Error Handling](#11-error-handling)
12. [Versioning & Extension](#12-versioning--extension)
13. [Competitive Analysis & Differentiation](#13-competitive-analysis--differentiation)
14. [Open Issues & Resolutions](#14-open-issues--resolutions)
15. [Glossary](#15-glossary)

---

## 1. Naming Decision

### Why "H2A" and not "F2A"

| Criterion | F2A (Frontend-to-Agent) | H2A (Human-to-Agent) |
|-----------|------------------------|----------------------|
| Scope | Implies browser/web only | Covers voice, AR, CLI, IoT |
| Framing | Technical implementation detail | The actual relationship |
| Inclusivity | Excludes non-visual interfaces | Includes screen readers, voice, haptics |
| Marketing | Sounds like a build tool | Sounds like a movement |
| Parallel | MCP, A2A, F2A — inconsistent | MCP, A2A, H2A — "who talks to whom" |
| Longevity | "Frontend" may evolve away | "Human" is permanent |

**Decision:** H2A — Human-to-Agent Protocol.

The protocol governs the boundary where a human's intent meets an agent's capability.
The frontend is an implementation detail. The human is the constant.

### Adversarial Review of the Name

**Critic (Google/A2A team):** "A2A already handles human interaction through its
streaming and artifact system. H2A is unnecessary fragmentation."

**Response:** A2A's Task/Message model is agent-centric. It has no concept of UI state,
presence, or real-time UI manipulation. A human talking to an A2A agent gets a text
stream and file artifacts. H2A provides the rich interaction layer that A2A explicitly
out-of-scoped: breathing states, form manipulation, confirmation flows, interruption
granularity. H2A and A2A are complementary, not competing.

**Critic (Anthropic/MCP team):** "MCP Sampling already allows agents to prompt the user.
Why not extend MCP?"

**Response:** MCP Sampling is one-shot request-response for human-in-the-loop confirmation.
H2A governs continuous, bidirectional, stateful interaction: streaming responses, UI state
observation, presence signaling, real-time orchestration. Extending MCP to cover this
would violate MCP's design principle of simplicity. H2A bridges from MCP upward — an
agent can use MCP for tools and H2A for human interaction simultaneously.

**Critic (CopilotKit team):** "We already solve this. CopilotKit IS the frontend-agent protocol."

**Response:** CopilotKit is a React library, not a protocol. It couples transport, rendering,
and state management into one opinionated package. H2A is the protocol beneath —
CopilotKit could implement H2A as its transport layer and instantly become interoperable
with every other H2A-compatible agent backend.

**Critic (Industry skeptic):** "Another standard? XKCD 927."

**Response:** Valid concern. H2A is not another chat SDK. It is the protocol layer that is
currently missing. MCP did not create "yet another tool-calling format" — it unified them.
H2A does the same for the human-agent boundary. The proof: every project currently invents
this layer from scratch.

---

## 2. Problem Statement

### The Current State (2026)

Every application that integrates an AI agent must solve these problems independently:

1. **How does the agent receive UI context?** (What page is the user on? What data is visible?)
2. **How does the agent stream responses?** (Token by token? Full messages? Structured frames?)
3. **How does the agent render rich UI?** (Tool results, confirmations, progress indicators?)
4. **How does the agent manipulate the UI?** (Fill forms, navigate, trigger actions?)
5. **How does the user interrupt the agent?** (Cancel? Redirect? Pause?)
6. **How does the agent signal its state?** (Thinking? Idle? Working? Needs input?)

Each framework answers these differently:

| Problem | CopilotKit | Vercel AI SDK | OpenAI Assistants | LangChain |
|---------|-----------|---------------|-------------------|-----------|
| UI Context | useCopilotReadable | None | None | None |
| Streaming | Custom SSE | AI Stream | Run polling | Callback chain |
| Rich UI | RenderToolCall | tool-invocation | Code Interpreter output | None |
| UI Manipulation | useCopilotAction | None | None | None |
| Interruption | None (abort signal) | AbortController | Run cancellation | None |
| Presence | None | None | Run status | None |

**Result:** Lock-in. Migration pain. Duplicated effort. No interoperability.

### What H2A Solves

H2A defines the **message shapes** and **interaction patterns** between any frontend
and any agent backend, regardless of:

- Frontend framework (React, Vue, Svelte, native, CLI, voice)
- Agent framework (LangChain, LangGraph, custom, none)
- LLM provider (Anthropic, OpenAI, Gemini, local)
- Transport (SSE, WebSocket, HTTP)

---

## 3. Design Principles

### P1: Protocol, Not Framework

H2A defines message shapes and interaction patterns. It does NOT define:
- How to render UI components (that's the SDK's job)
- Which LLM to use (that's the agent's choice)
- How to store conversation history (that's the backend's concern)

### P2: Human-Centric, Not Agent-Centric

The human is always in control. The agent serves, suggests, and assists.
Every agent action is visible, interruptible, and revertible.

### P3: Progressive Complexity

A minimal H2A implementation is a text-streaming chat.
Add presence? Optional. Add state sync? Optional. Add UI orchestration? Optional.
Each capability is an independently adoptable layer.

### P4: Transport Agnostic

H2A messages can flow over SSE, WebSocket, HTTP polling, gRPC, or carrier pigeon.
The spec defines the envelope, not the wire.

### P5: Composable with MCP and A2A

An H2A agent CAN simultaneously be an A2A agent (discoverable by other agents)
and use MCP (connecting to tools). H2A does not replace or compete.

### P6: Accessibility First

If it can't be used by a screen reader, voice interface, or keyboard-only user,
it's not H2A-compliant. Rich UI capabilities are progressive enhancements
over a text-based baseline.

---

## 4. Protocol Overview

### Participants

```
┌─────────────┐           ┌──────────────┐
│   H2A Host  │ ←──H2A──→ │  H2A Agent   │
│  (Frontend) │           │  (Backend)   │
└─────────────┘           └──────────────┘
```

- **H2A Host**: The application presenting the agent to the human.
  Could be a browser, mobile app, CLI, voice assistant, AR headset.
- **H2A Agent**: The backend system that processes human intent and responds.
  Could be a single LLM call, a LangGraph workflow, or a multi-agent system.

### Message Flow

```
Host                                              Agent
 │                                                  │
 │──── AgentCard Request ──────────────────────────→│
 │←─── AgentCard Response ─────────────────────────│
 │                                                  │
 │──── Session.Open ───────────────────────────────→│
 │←─── Session.Ack ────────────────────────────────│
 │                                                  │
 │──── StateSnapshot ──────────────────────────────→│  (Host tells Agent what user sees)
 │←─── PresenceUpdate ─────────────────────────────│  (Agent adjusts its state)
 │                                                  │
 │──── UserSignal (message) ───────────────────────→│
 │←─── AgentFrame (text, streaming) ───────────────│
 │←─── AgentFrame (text, streaming) ───────────────│
 │←─── AgentFrame (tool_card) ─────────────────────│
 │←─── AgentFrame (end) ──────────────────────────│
 │                                                  │
 │──── UserSignal (confirm tool) ──────────────────→│
 │←─── AgentFrame (state_delta) ───────────────────│  (Agent manipulates UI)
 │←─── PresenceUpdate (orchestrating) ─────────────│
 │                                                  │
 │──── UserSignal (interrupt) ─────────────────────→│
 │←─── AgentFrame (interrupted_ack) ───────────────│
 │←─── PresenceUpdate (rest) ──────────────────────│
 │                                                  │
```

---

## 5. Core Primitives

### 5.1 AgentCard

Describes the agent's identity and capabilities. Served at a well-known endpoint.
Analogous to A2A's Agent Card but with UI-specific capabilities.

```json
{
  "h2a": "0.1",
  "name": "Atlas",
  "description": "AI project management assistant",
  "domain": ["project-management", "task-tracking"],
  "identity": {
    "personality": "Focused, helpful, proactive",
    "language": "en",
    "formality": "adaptive"
  },
  "capabilities": {
    "streaming": true,
    "presence": true,
    "stateObservation": true,
    "uiOrchestration": true,
    "multimodal": ["text", "audio"],
    "interruptible": true
  },
  "presence": {
    "states": ["rest", "attentive", "conversing", "orchestrating"],
    "defaultState": "rest"
  },
  "frameTypes": [
    "text", "tool_card", "confirmation", "progress",
    "state_delta", "toast", "artifact"
  ],
  "endpoint": {
    "h2a": "https://api.example.com/h2a",
    "agentCard": "https://api.example.com/.well-known/h2a-agent.json"
  },
  "authentication": {
    "schemes": ["bearer", "oauth2"]
  }
}
```

**Well-Known URL**: `/.well-known/h2a-agent.json` (like A2A's `/.well-known/agent.json`)

### 5.2 Session

A session is a continuous interaction between one human and one agent.
Sessions persist across page navigations and can survive reconnections.

```json
{
  "type": "session.open",
  "sessionId": "ses_abc123",
  "resumeFrom": "msg_xyz789",
  "hostCapabilities": {
    "rendering": ["markdown", "html", "tool_card", "confirmation"],
    "stateSync": true,
    "orchestration": true,
    "accessibility": {
      "screenReader": false,
      "reducedMotion": false,
      "voiceOnly": false
    }
  },
  "locale": "de-DE",
  "timezone": "Europe/Berlin"
}
```

### 5.3 StateSnapshot

Sent by the Host to inform the Agent about the current UI context.
The Agent uses this to adapt its behavior (presence state, proactive suggestions).

```json
{
  "type": "state.snapshot",
  "timestamp": "2026-04-20T10:30:00Z",
  "page": {
    "route": "/series/noir-hamburg/episodes/1/edit",
    "title": "Episode 1 — Kapitel 3",
    "section": "episode-editor"
  },
  "data": {
    "episodeId": "ep_001",
    "currentChapter": 3,
    "wordCount": 2847,
    "workflowPhase": "drafting",
    "unsavedChanges": true
  },
  "user": {
    "activity": "typing",
    "idleSeconds": 0,
    "focusedElement": "chapter-text-editor"
  }
}
```

**Privacy Note:** StateSnapshots MUST NOT contain data beyond what the agent needs.
See [Section 10: Privacy & Consent](#10-privacy--consent).

#### State Diff (Incremental Updates)

For efficiency, after the initial snapshot, the Host MAY send diffs:

```json
{
  "type": "state.diff",
  "timestamp": "2026-04-20T10:30:15Z",
  "changes": [
    { "op": "replace", "path": "/user/activity", "value": "idle" },
    { "op": "replace", "path": "/user/idleSeconds", "value": 15 },
    { "op": "replace", "path": "/data/wordCount", "value": 2891 }
  ]
}
```

Uses JSON Patch (RFC 6902) for diffs.

### 5.4 AgentFrame

The core innovation of H2A. An AgentFrame is a single unit of agent output.
Unlike plain text streaming, AgentFrames are typed and structured.

```json
{
  "type": "agent.frame",
  "id": "frm_001",
  "frameType": "text",
  "content": "Ich seh mir gerade Kapitel 3 an...",
  "streaming": true,
  "final": false,
  "metadata": {
    "interruptible": true,
    "revertible": false,
    "presenceHint": "conversing"
  }
}
```

#### Frame Types

| frameType | Purpose | Content Schema |
|-----------|---------|---------------|
| `text` | Streamed or complete text message | `{ text: string }` or raw string |
| `tool_card` | Rendered tool invocation/result | `{ tool: string, input: {}, output: {}, status: string }` |
| `confirmation` | Human-in-the-loop approval request | `{ action: string, description: string, options: [] }` |
| `progress` | Long-running operation status | `{ task: string, percent: number, message: string }` |
| `state_delta` | Agent manipulates the UI | `{ operations: [{ op, target, value }] }` |
| `toast` | Non-intrusive notification | `{ message: string, severity: string, duration: number }` |
| `artifact` | File or structured output | `{ mimeType: string, data: string, name: string }` |
| `component` | Custom UI component (extension point) | `{ componentType: string, props: {} }` |
| `end` | Signals end of current response | `{ reason: string }` |

#### State Delta Operations

When the agent orchestrates UI changes:

```json
{
  "type": "agent.frame",
  "frameType": "state_delta",
  "content": {
    "operations": [
      { "op": "navigate", "target": "/series/create" },
      { "op": "fill", "target": "#title-input", "value": "Noir Hamburg" },
      { "op": "fill", "target": "#genre-select", "value": "thriller" },
      { "op": "click", "target": "#create-button" },
      { "op": "wait", "target": "navigation", "timeout": 5000 }
    ]
  },
  "metadata": {
    "interruptible": true,
    "revertible": true,
    "revertOperations": [
      { "op": "navigate", "target": "/series" }
    ],
    "narration": "Erstelle die Serie 'Noir Hamburg'..."
  }
}
```

**Critical:** State deltas with `revertible: true` MUST include `revertOperations`.
The Host MUST be able to undo any agent UI manipulation.

### 5.5 UserSignal

Sent by the Host to convey human intent to the Agent.

```json
{
  "type": "user.signal",
  "signalType": "message",
  "content": "Mach die Bible fertig, Noir-Thriller, Hamburg.",
  "context": {
    "referencedFrames": [],
    "attachments": []
  }
}
```

#### Signal Types

| signalType | Purpose | Content |
|------------|---------|---------|
| `message` | Human sends a text message | `{ text, attachments? }` |
| `confirm` | Human approves a confirmation frame | `{ frameId, choice }` |
| `deny` | Human rejects a confirmation frame | `{ frameId, reason? }` |
| `interrupt` | Human stops the current agent action | `{ scope: "current" \| "all" }` |
| `redirect` | Human changes topic mid-stream | `{ newIntent: string }` |
| `context_change` | Page/view has changed | (triggers new StateSnapshot) |
| `feedback` | Human rates an agent response | `{ frameId, rating, comment? }` |

### 5.6 PresenceUpdate

The agent signals its current state to the Host.

```json
{
  "type": "presence.update",
  "state": "attentive",
  "confidence": 0.8,
  "trigger": "User idle on empty field for 45 seconds",
  "suggestedAction": "offer_help"
}
```

---

## 6. Transport Layer

### 6.1 Default Transport: SSE + HTTP POST

H2A's default transport mirrors the pattern proven by MCP and most LLM APIs:

- **Host → Agent**: HTTP POST requests
- **Agent → Host**: Server-Sent Events (SSE)

```
Host                          Agent
 │                              │
 │── POST /h2a/session ────────→│   (Session.Open)
 │← SSE stream opened ─────────│
 │                              │
 │── POST /h2a/signal ─────────→│   (UserSignal)
 │← SSE: AgentFrame ───────────│
 │← SSE: AgentFrame ───────────│
 │← SSE: PresenceUpdate ───────│
 │                              │
```

#### SSE Event Format

```
event: agent.frame
id: frm_001
data: {"type":"agent.frame","frameType":"text","content":"Ich...","streaming":true}

event: presence.update
id: prs_001
data: {"type":"presence.update","state":"conversing","confidence":1.0}
```

### 6.2 Alternative Transports

| Transport | When to use | Trade-off |
|-----------|------------|-----------|
| **WebSocket** | High-frequency bidirectional (gaming, real-time collab) | More complex, stateful |
| **HTTP Streaming** | Simple environments without SSE support | Less control over events |
| **gRPC** | High-performance, typed, internal services | Requires protobuf, not browser-native |
| **stdio** | CLI agents, local tools | No network, process-bound |

Each transport MUST deliver the same message shapes. The transport is negotiated
in the `session.open` handshake.

### 6.3 Reconnection

H2A sessions MUST survive network interruptions:

1. Each message has a monotonic `sequence` number
2. On reconnect, the Host sends `session.resume` with `lastReceivedSequence`
3. The Agent replays missed messages or sends a `state.reset` if too far behind

```json
{
  "type": "session.resume",
  "sessionId": "ses_abc123",
  "lastReceivedSequence": 42
}
```

---

## 7. Presence System

### 7.1 Standard Presence States

H2A defines four canonical presence states. Agents MAY support a subset.

| State | Meaning | Visual Hint | Agent Behavior |
|-------|---------|-------------|----------------|
| `rest` | Agent is passive, observing | Minimal UI, subtle indicator | Monitoring state, no output |
| `attentive` | Agent noticed something | Soft highlight, badge | May send toast or suggestion |
| `conversing` | Active dialogue | Full chat UI | Streaming text, accepting input |
| `orchestrating` | Agent is acting on UI | Progress indicator, narration | Sending state_deltas, showing work |

### 7.2 Presence Transitions

```
                    ┌─────────────┐
           ┌───────→│    REST     │←──────────┐
           │        └──────┬──────┘           │
           │               │ Agent detects    │ Action complete
           │               │ something        │ or user dismisses
           │               ▼                  │
           │        ┌─────────────┐           │
           │        │  ATTENTIVE  │───────────┘
           │        └──────┬──────┘
           │               │ User engages
           │               ▼
           │        ┌─────────────┐
           └────────│ CONVERSING  │
           │        └──────┬──────┘
           │               │ User gives
           │               │ orchestration command
           │               ▼
           │        ┌──────────────┐
           └────────│ORCHESTRATING │
                    └──────────────┘
```

### 7.3 Custom Presence States

Agents MAY define additional states in their AgentCard:

```json
{
  "presence": {
    "states": ["rest", "attentive", "conversing", "orchestrating", "reviewing", "waiting_for_external"],
    "custom": {
      "reviewing": {
        "parent": "attentive",
        "description": "Agent is reviewing content quality"
      },
      "waiting_for_external": {
        "parent": "orchestrating",
        "description": "Agent is waiting for an external service"
      }
    }
  }
}
```

Custom states MUST declare a `parent` from the four canonical states.
Hosts that don't understand custom states fall back to the parent.

---

## 8. Security Model

### 8.1 Threat Model

| Threat | Vector | Mitigation |
|--------|--------|------------|
| **Prompt Injection via State** | Malicious page content in StateSnapshot | Agent MUST treat StateSnapshot as untrusted input |
| **UI Manipulation Abuse** | Agent fills forms with harmful data | Host validates ALL state_delta operations against an allowlist |
| **Session Hijacking** | Stolen session tokens | Bind sessions to authenticated users, short-lived tokens |
| **Data Exfiltration** | Agent reads sensitive UI data | StateSnapshot allowlisting (Section 10) |
| **Denial of Service** | Agent floods Host with frames | Host-side rate limiting on frame ingestion |
| **Clickjacking** | Agent navigates to external URLs | state_delta.navigate restricted to same-origin by default |

### 8.2 State Delta Sandboxing

The Host MUST enforce a security policy on state_delta operations:

```json
{
  "orchestrationPolicy": {
    "allowedOperations": ["fill", "navigate", "click", "scroll"],
    "deniedOperations": ["delete", "submit_payment"],
    "navigationScope": "same-origin",
    "requireConfirmation": ["submit", "delete", "navigate_external"],
    "maxOperationsPerFrame": 20,
    "rateLimitPerMinute": 100
  }
}
```

### 8.3 Authentication

H2A supports these authentication schemes:

1. **Bearer Token** — Simple, widely supported
2. **OAuth 2.0** — For third-party agent services
3. **Session Cookie** — For same-origin agents embedded in the app

The scheme is declared in the AgentCard and negotiated at session open.

---

## 9. Accessibility

### 9.1 A11y Requirements (Normative)

H2A-compliant Hosts MUST:

1. **Announce presence changes** via ARIA live regions
2. **Make all AgentFrames reachable** by keyboard navigation
3. **Provide text alternatives** for all visual presence indicators
4. **Support `reducedMotion`** — disable breathing animations when requested
5. **Never require mouse interaction** to confirm, deny, or interrupt

### 9.2 Voice-Only Mode

H2A supports hosts that have no visual UI (smart speakers, phone bots):

- StateSnapshots contain `voiceContext` instead of `page`/`data`
- AgentFrames of type `text` are spoken via TTS
- `confirmation` frames become voice prompts ("Soll ich fortfahren? Sag ja oder nein.")
- `state_delta` frames are narrated ("Ich erstelle jetzt die Serie Noir Hamburg.")
- `toast` frames are spoken with appropriate urgency

### 9.3 Screen Reader Compatibility

| Frame Type | ARIA Role | Announcement |
|------------|----------|--------------|
| `text` | `log` | Content announced as it streams |
| `tool_card` | `status` | "Agent used [tool name]: [result summary]" |
| `confirmation` | `alertdialog` | "Agent asks: [action]. Confirm or deny." |
| `progress` | `progressbar` | "[task] [percent]% complete" |
| `toast` | `alert` | "[severity]: [message]" |
| `state_delta` | `status` | "Agent is [narration]" |

---

## 10. Privacy & Consent

### 10.1 Data Minimization

StateSnapshots are powerful — they tell the agent what the user sees.
This power requires strict boundaries.

**Rule:** The Host MUST only include data in StateSnapshots that is:
1. Necessary for the agent's declared `domain`
2. Consented to by the user (explicitly or via app terms)
3. Not in the exclusion list (passwords, payment data, PII beyond what's needed)

### 10.2 StateSnapshot Allowlisting

The Host declares what it will share, the Agent declares what it needs:

```json
// Host capability declaration (in session.open)
{
  "stateSync": {
    "shares": ["page.route", "page.title", "data.*", "user.activity"],
    "excludes": ["data.paymentInfo", "data.password"]
  }
}

// Agent requirement (in AgentCard)
{
  "stateRequirements": {
    "required": ["page.route", "page.title"],
    "optional": ["data.*", "user.activity", "user.idleSeconds"],
    "neverSend": ["*.password", "*.token", "*.creditCard"]
  }
}
```

### 10.3 Conversation Data

| Data | Retention | Control |
|------|-----------|---------|
| Conversation history | Agent-defined, MUST be disclosed | User can request deletion |
| StateSnapshots | Ephemeral by default, not persisted | Host controls what's sent |
| Artifacts | Persistent, stored by agent | User can list and delete |
| Presence data | Not persisted | Never stored |

### 10.4 GDPR / Data Subject Rights

H2A agents MUST implement these endpoints if operating in GDPR jurisdictions:

- `GET /h2a/data-export/{userId}` — Export all stored data
- `DELETE /h2a/data/{userId}` — Delete all stored data
- `GET /h2a/data-policy` — Human-readable privacy policy

---

## 11. Error Handling

### 11.1 Error Frame

Errors are communicated via a special AgentFrame:

```json
{
  "type": "agent.frame",
  "frameType": "error",
  "content": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please wait 30 seconds.",
    "retryAfter": 30,
    "severity": "warning"
  }
}
```

### 11.2 Error Codes

| Code | Meaning | Host Action |
|------|---------|-------------|
| `SESSION_EXPIRED` | Session no longer valid | Re-open session |
| `RATE_LIMITED` | Too many signals | Back off for `retryAfter` seconds |
| `ORCHESTRATION_DENIED` | Agent tried disallowed operation | Log, inform user |
| `STATE_SYNC_ERROR` | Invalid StateSnapshot | Re-send full snapshot |
| `AGENT_OVERLOADED` | Backend capacity exceeded | Retry with backoff |
| `UNSUPPORTED_FRAME` | Host can't render this frame type | Fallback to text |
| `AUTHENTICATION_REQUIRED` | Session not authenticated | Trigger auth flow |

### 11.3 Graceful Degradation

If a Host doesn't support a frameType, the agent MUST provide a text fallback.
Every AgentFrame MAY include a `fallbackText` field:

```json
{
  "frameType": "tool_card",
  "content": { "tool": "search", "output": { "results": [...] } },
  "fallbackText": "Ich habe 3 Ergebnisse gefunden: 1) ... 2) ... 3) ..."
}
```

---

## 12. Versioning & Extension

### 12.1 Semantic Versioning

H2A uses semver. The version is declared in every AgentCard and session.open.

- **Patch** (0.1.x): Bug fixes in spec text, no message shape changes
- **Minor** (0.x.0): New optional frame types, new optional fields
- **Major** (x.0.0): Breaking changes to existing message shapes

### 12.2 Extension Mechanism

Agents and Hosts can define custom frame types and signal types using the `x-` prefix:

```json
{
  "frameType": "x-audio-preview",
  "content": {
    "audioUrl": "https://...",
    "duration": 12.5,
    "waveform": [0.1, 0.3, 0.7, ...]
  }
}
```

Custom extensions:
- MUST use the `x-` prefix
- MUST include `fallbackText`
- SHOULD be proposed as spec additions if widely useful

### 12.3 Capability Negotiation

At session open, Host and Agent negotiate capabilities:

```json
// Host: "I can render these frame types"
{
  "hostCapabilities": {
    "rendering": ["text", "tool_card", "confirmation", "progress", "toast"],
    "stateSync": true,
    "orchestration": false
  }
}

// Agent: "I will only send frames you can render"
{
  "negotiatedCapabilities": {
    "frameTypes": ["text", "tool_card", "confirmation", "progress", "toast"],
    "stateSync": true,
    "orchestration": false,
    "presence": true
  }
}
```

---

## 13. Competitive Analysis & Differentiation

### 13.1 Why Existing Solutions Are Not Enough

#### CopilotKit

| Aspect | CopilotKit | H2A |
|--------|-----------|-----|
| Type | React library | Protocol (framework-agnostic) |
| Transport | Custom, opaque | Specified, interchangeable |
| Agent backend | Must use CopilotKit backend | Any backend |
| State sync | useCopilotReadable (React-specific) | StateSnapshot (universal) |
| Extensibility | Plugin API | Extension prefix (x-) |
| Presence | None | First-class |
| Accessibility | Partial | Normative requirement |

**Adoption path:** CopilotKit implements H2A transport → gains interoperability, loses nothing.

#### Vercel AI SDK

| Aspect | Vercel AI SDK | H2A |
|--------|-------------|-----|
| Type | TypeScript SDK | Protocol |
| State sync | None | StateSnapshot |
| UI manipulation | None | State Delta |
| Presence | None | First-class |
| Rich rendering | tool-invocation (unstructured) | Typed AgentFrames |

**Adoption path:** Vercel AI SDK uses H2A message shapes → unified tool rendering across frameworks.

#### AG-UI (Agent-User Interaction Protocol)

| Aspect | AG-UI | H2A |
|--------|-------|-----|
| Focus | Event streaming for agent UI | Full human-agent interaction |
| State sync | StateSnapshot, StateDelta | StateSnapshot, StateDiff (RFC 6902) |
| Presence | Lifecycle events only | Semantic breathing states |
| Orchestration | Tool calls only | Full UI manipulation |
| Accessibility | Not addressed | Normative requirement |
| Privacy | Not addressed | First-class consent model |
| Error handling | Not specified | Typed error frames with fallback |

**Note:** AG-UI (by CopilotKit, 2025) is the closest to H2A in spirit.
H2A acknowledges AG-UI's contributions and goes further in security,
accessibility, privacy, and presence.

#### A2A (Google)

| Aspect | A2A | H2A |
|--------|-----|-----|
| Focus | Agent coordination | Human interaction |
| Participants | Agent ↔ Agent | Human ↔ Agent |
| UI awareness | None | StateSnapshot, Presence |
| Streaming | Task-level SSE | Frame-level SSE (token granularity) |
| Rich UI | Artifacts (files) | AgentFrames (live UI) |

**Bridge potential:** An H2A agent can expose an A2A interface for agent-to-agent scenarios
while using H2A for human-facing interaction. Same agent, two protocols.

---

## 14. Open Issues & Resolutions

### Issue 1: Multi-Agent Frontends

**Problem:** What if a frontend hosts multiple agents? (e.g., a coding agent + a design agent)

**Raised by:** Ecosystem Architect role

**Resolution:** Each agent has its own session. The Host manages agent switching.
H2A defines a `session.switch` signal:

```json
{
  "type": "user.signal",
  "signalType": "session_switch",
  "content": {
    "fromSession": "ses_coding",
    "toSession": "ses_design",
    "handoffContext": "User wants design feedback on the component just coded"
  }
}
```

For shared context between agents: use A2A for agent-to-agent coordination,
H2A only governs each agent's individual connection to the human.

---

### Issue 2: Offline / Local-First Agents

**Problem:** H2A assumes network. What about local LLMs, on-device agents?

**Raised by:** Privacy Advocate role

**Resolution:** H2A supports `stdio` transport for local agents.
The same message shapes flow over process I/O instead of HTTP.
A local agent running in a WebWorker uses `postMessage` as transport.

```json
{
  "transport": "stdio",
  "endpoint": { "command": "python", "args": ["my-local-agent.py"] }
}
```

---

### Issue 3: Agent Marketplace / Discovery

**Problem:** How does a Host find compatible H2A agents?

**Raised by:** Business Strategist role

**Resolution:** AgentCards at `/.well-known/h2a-agent.json` enable discovery.
A future H2A Registry (like npm for agents) could index these.
Phase 5 in the roadmap. For now: manual endpoint configuration.

---

### Issue 4: Conflict with Existing UI State Management

**Problem:** StateDelta conflicts with React state, Redux, MobX, etc.
Who is the source of truth?

**Raised by:** Frontend Architect role (Critic)

**Resolution:** The Host is ALWAYS the source of truth. StateDelta is a REQUEST,
not a command. The Host's SDK translates state_delta operations into framework-native
state updates (Redux dispatch, React setState, Vue reactive update).

```
Agent sends state_delta → Host SDK validates → Host SDK dispatches → UI updates
                                    ↑
                          Host can reject or modify
```

The agent never directly manipulates DOM or state. The Host SDK mediates.

---

### Issue 5: Latency & Performance

**Problem:** StateSnapshots on every interaction could be expensive.

**Raised by:** Performance Engineer role

**Resolution:**
1. StateDiffs (JSON Patch) after initial snapshot — minimal payload
2. Throttling: Host sends at most 1 snapshot per second
3. Agent declares `stateRequirements.optional` — Host only sends what's needed
4. Binary frames for high-frequency data (future extension)

---

### Issue 6: Agent Autonomy vs. User Control

**Problem:** How far can an agent go without asking? A "fill form" is fine,
a "delete all data" is not.

**Raised by:** Security Officer role

**Resolution:** Three-tier action classification:

| Tier | Description | Behavior |
|------|-------------|----------|
| **Autonomous** | Read-only, reversible, low-impact | Agent acts, narrates |
| **Confirmable** | Significant but revertible | Agent sends `confirmation` frame, waits |
| **Restricted** | Irreversible, destructive, financial | Agent describes intent, Host blocks until explicit approval |

The Host defines the tier mapping in `orchestrationPolicy`.
Agents MUST respect the Host's classification even if they disagree.

---

### Issue 7: Internationalization

**Problem:** Agents need to operate in any language, including RTL.

**Raised by:** Globalization Engineer role

**Resolution:**
- `session.open` includes `locale` and text direction is inferred
- AgentFrames include optional `lang` field for mixed-language responses
- Presence state names are protocol constants (English), display names are localized by the Host SDK
- The spec uses English for identifiers, but all human-facing text is agent-controlled

---

### Issue 8: Testing & Compliance

**Problem:** How do developers verify their implementation is H2A-compliant?

**Raised by:** QA Engineer role

**Resolution:** The H2A spec will include:
1. **Conformance test suite** — automated tests against Host and Agent implementations
2. **H2A Playground** — interactive tool to send/receive messages manually
3. **Compliance levels:**
   - **H2A Basic**: Text streaming + UserSignals (minimum viable)
   - **H2A Standard**: + Presence + StateSync + Confirmation
   - **H2A Full**: + Orchestration + Accessibility + Privacy

---

### Issue 9: Bandwidth of StateSnapshots

**Problem:** Complex apps have huge state. Can't send it all.

**Raised by:** Performance Engineer role (second review)

**Resolution:** Structural sharing and projections:

```json
{
  "stateRequirements": {
    "projections": {
      "data": ["episodeId", "currentChapter", "wordCount"],
      "user": ["activity", "idleSeconds"]
    },
    "maxSnapshotSize": 4096
  }
}
```

The agent declares projections (like a GraphQL selection set).
The Host only serializes the selected fields.

---

### Issue 10: Monetization & Business Model

**Problem:** Standards die without economic incentive. Who pays?

**Raised by:** CEO/Investor role

**Resolution:**
- **Protocol**: Free, open, MIT — like HTTP
- **SDKs**: Free, open-source — like Express.js
- **Premium**: Hosted H2A gateway (routing, analytics, compliance), enterprise support
- **Registry**: Agent listing (free basic, paid featured placement)
- **Certification**: "H2A Certified" badge for compliance testing

The economic model mirrors MCP: protocol is free, ecosystem creates value.

---

### Issue 11: What About Native Mobile?

**Problem:** React Native, Flutter, Swift UI, Kotlin — not just web.

**Raised by:** Mobile Engineer role

**Resolution:** H2A is protocol-level, not DOM-level.
- StateSnapshots describe app state, not DOM state
- StateDelta operations target abstract identifiers, not CSS selectors
- Each platform SDK (React, Swift, Kotlin, Flutter) maps H2A to native patterns

```swift
// Hypothetical Swift SDK
let agent = H2AAgent(endpoint: "https://api.example.com/h2a")
agent.onFrame { frame in
    switch frame.type {
    case .text: updateChatView(frame.content)
    case .stateDelta: applyOperations(frame.operations)
    case .presence: updateAgentIndicator(frame.state)
    }
}
```

---

### Issue 12: Relationship to AG-UI

**Problem:** CopilotKit already published AG-UI. Are we reinventing?

**Raised by:** Open Source Community role (Critic)

**Resolution:** AG-UI and H2A share DNA but differ in critical ways:

1. **AG-UI lacks security model** — H2A has sandboxing, allowlists, tier classification
2. **AG-UI lacks accessibility spec** — H2A has normative a11y requirements
3. **AG-UI lacks privacy framework** — H2A has consent, data minimization, GDPR
4. **AG-UI lacks presence** — H2A's breathing states are philosophically grounded
5. **AG-UI is CopilotKit-adjacent** — H2A is vendor-neutral from day one

**Strategy:** Acknowledge AG-UI's pioneering work publicly. Position H2A as the
security-hardened, accessibility-first evolution. Offer AG-UI → H2A migration tooling.
If AG-UI team wants to merge efforts: welcome. H2A's governance is open.

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| **H2A** | Human-to-Agent Protocol — the interaction standard between humans and AI agents |
| **Host** | The application presenting the agent to the human (browser, app, CLI, voice) |
| **Agent** | The backend system processing human intent and generating responses |
| **AgentCard** | JSON document describing an agent's identity and capabilities |
| **AgentFrame** | A typed unit of agent output (text, tool card, confirmation, etc.) |
| **UserSignal** | A typed unit of human input (message, confirm, interrupt, etc.) |
| **StateSnapshot** | A Host-to-Agent message describing the current UI context |
| **StateDiff** | An incremental update to a previous StateSnapshot (JSON Patch) |
| **StateDelta** | An Agent-to-Host request to manipulate the UI |
| **PresenceState** | The agent's current behavioral state (rest, attentive, conversing, orchestrating) |
| **Session** | A continuous interaction between one human and one agent |
| **Frame Type** | The kind of AgentFrame (text, tool_card, confirmation, etc.) |
| **Orchestration** | The agent performing actions on the UI on behalf of the human |
| **Breathing** | The metaphor for presence state transitions (calm → alert → active → working) |

---

## Companion Documents

The following documents are normative parts of the H2A v0.1 specification:

| Document | Scope |
|----------|-------|
| [Conformance Levels](h2a-conformance-levels.md) | Formal MUST/SHOULD/MAY requirements for Basic, Standard, Full |
| [Security Addendum](h2a-security-addendum.md) | Content sanitization, session security, frame limits, audit logs |
| [Test Vectors](h2a-test-vectors.md) | Normative message exchanges implementations MUST handle |
| [Voice Extension](h2a-voice-extension.md) | Turn-taking, STT/TTS, barge-in, audio streaming |
| [JSON Schemas](schema/) | Machine-readable definitions for all message types |

---

## Appendix A: Full Message Type Reference

See [schema/](schema/) for JSON Schema definitions of all message types:

- `agent-card.schema.json` — AgentCard structure
- `messages.schema.json` — All 8 message types (Session, State, Frame, Signal, Presence)
- `orchestration-policy.schema.json` — Security policy for UI manipulation
- `health-check.schema.json` — Agent health endpoint response format

## Appendix B: Planned Reference Implementations

- `@h2a/core` — Transport and message parsing (TypeScript)
- `@h2a/react` — React bindings with hooks and components
- `@h2a/test-suite` — Conformance test runner
- `h2a-python` — Python server library for agent backends

## Appendix C: Acknowledgments

H2A builds on ideas from:
- **MCP** (Anthropic) — Protocol-first thinking, tool abstraction
- **A2A** (Google) — Agent Cards, capability discovery
- **AG-UI** (CopilotKit) — State sync, event streaming concepts
- Human-centric interaction design research — Presence states, proactive agency

---

*This specification is a living document. Contributions welcome.
See [CONTRIBUTING.md](../CONTRIBUTING.md) for the RFC process.*

# H2A Architecture Overview

## The Three-Layer Stack

```
╔══════════════════════════════════════════════════════════════╗
║                        HUMAN LAYER                          ║
║                                                              ║
║   Browser    Mobile App    CLI    Voice    AR/VR    IoT      ║
║      │           │          │       │        │       │       ║
║      └───────────┴──────────┴───────┴────────┴───────┘       ║
║                           │                                   ║
║                    ┌──────┴──────┐                            ║
║                    │  H2A HOST   │  (SDK: React, Vue, Swift)  ║
║                    │  SDK        │                            ║
║                    └──────┬──────┘                            ║
╠═══════════════════════════╪══════════════════════════════════╣
║                    H2A PROTOCOL                              ║
║                                                              ║
║  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       ║
║  │ AgentFrames  │  │ UserSignals  │  │ Presence     │       ║
║  │ (Agent→Host) │  │ (Host→Agent) │  │ (Agent→Host) │       ║
║  └──────────────┘  └──────────────┘  └──────────────┘       ║
║                                                              ║
║  ┌──────────────┐  ┌──────────────┐                         ║
║  │ StateSync    │  │ Sessions     │                         ║
║  │ (Host→Agent) │  │ (bidirect.)  │                         ║
║  └──────────────┘  └──────────────┘                         ║
║                                                              ║
║  Transport: SSE + HTTP POST │ WebSocket │ stdio │ gRPC       ║
╠═══════════════════════════╪══════════════════════════════════╣
║                    ┌──────┴──────┐                            ║
║                    │  H2A AGENT  │  (Python, Go, Rust, JS)   ║
║                    │  SERVER     │                            ║
║                    └──────┬──────┘                            ║
║                           │                                   ║
║              ┌────────────┼────────────┐                     ║
║              │            │            │                     ║
║         ┌────┴────┐  ┌────┴────┐  ┌────┴────┐              ║
║         │   MCP   │  │   A2A   │  │   LLM   │              ║
║         │  Tools  │  │  Agents │  │Provider │              ║
║         └─────────┘  └─────────┘  └─────────┘              ║
║                                                              ║
║                      AGENT LAYER                             ║
╚══════════════════════════════════════════════════════════════╝
```

## Message Flow: Complete Lifecycle

```
 HOST (Frontend)                              AGENT (Backend)
      │                                            │
      │  ──── GET /.well-known/h2a-agent.json ───→ │
      │  ←─── AgentCard ─────────────────────────  │
      │                                            │
      │  ──── POST /h2a/session ─────────────────→ │  Session Open
      │  ←─── SSE Stream (session.ack) ──────────  │
      │                                            │
      │  ──── POST /h2a/signal ──────────────────→ │  StateSnapshot
      │       { type: "state.snapshot", ... }      │
      │  ←─── SSE: presence.update (rest) ───────  │
      │                                            │
      │         ... user works, agent observes ... │
      │                                            │
      │  ──── POST /h2a/signal ──────────────────→ │  StateDiff (idle 60s)
      │       { type: "state.diff", ... }          │
      │  ←─── SSE: presence.update (attentive) ─  │
      │  ←─── SSE: agent.frame (toast) ──────────  │  "Brauchst du Hilfe?"
      │                                            │
      │  ──── POST /h2a/signal ──────────────────→ │  User Message
      │       { signalType: "message", ... }       │
      │  ←─── SSE: presence.update (conversing) ─  │
      │  ←─── SSE: agent.frame (text, stream) ───  │
      │  ←─── SSE: agent.frame (text, stream) ───  │
      │  ←─── SSE: agent.frame (text, final) ────  │
      │                                            │
      │  ──── POST /h2a/signal ──────────────────→ │  "Mach die Serie"
      │       { signalType: "message", ... }       │
      │  ←─── SSE: presence (orchestrating) ─────  │
      │  ←─── SSE: agent.frame (confirmation) ───  │  "Soll ich...?"
      │                                            │
      │  ──── POST /h2a/signal ──────────────────→ │  Confirm
      │       { signalType: "confirm", ... }       │
      │  ←─── SSE: agent.frame (state_delta) ────  │  Navigate + Fill
      │  ←─── SSE: agent.frame (progress, 30%) ─  │
      │  ←─── SSE: agent.frame (progress, 70%) ─  │
      │  ←─── SSE: agent.frame (state_delta) ────  │  More operations
      │  ←─── SSE: agent.frame (end) ────────────  │
      │  ←─── SSE: presence.update (rest) ───────  │
      │                                            │
      │         ... back to observing ...          │
      │                                            │
      │  ──── POST /h2a/signal ──────────────────→ │  Interrupt!
      │       { signalType: "interrupt" }          │
      │  ←─── SSE: agent.frame (interrupted_ack)   │
      │  ←─── SSE: presence.update (rest) ───────  │
      │                                            │
```

## Capability Levels

### H2A Basic (Minimum Viable)
- Text streaming (AgentFrame type: text)
- UserSignals (message, interrupt)
- Session management (open, resume)
- **Effort: ~100 lines of code per side**

### H2A Standard
- Everything in Basic, plus:
- Presence states (rest, attentive, conversing, orchestrating)
- StateSnapshot / StateDiff
- Tool Cards and Confirmations
- **Effort: ~500 lines of code per side**

### H2A Full
- Everything in Standard, plus:
- UI Orchestration (state_delta)
- Orchestration Policy / Sandboxing
- Accessibility compliance
- Privacy framework (GDPR endpoints)
- **Effort: ~1500 lines of code per side**

## Bridge Architecture

### H2A ↔ MCP Bridge
```
H2A Agent sees tool_card frame → internally calls MCP tool → returns result as tool_card
```
The human sees the tool execution through H2A. The agent uses MCP for the actual call.

### H2A ↔ A2A Bridge
```
H2A Agent receives complex request → delegates to A2A specialist agent → streams results back via H2A
```
The human talks to one H2A agent. That agent coordinates with A2A agents behind the scenes.

## Security Architecture

```
                    USER
                     │
                     ▼
              ┌──────────────┐
              │  H2A Host    │
              │              │
              │  ┌────────┐  │
              │  │Sandbox │  │ ← Orchestration Policy
              │  │        │  │   (allowlist, rate limits,
              │  │ state  │  │    action tiers)
              │  │ delta  │  │
              │  │ filter │  │
              │  └────────┘  │
              │       │      │
              │  ┌────┴───┐  │
              │  │ State  │  │ ← StateSnapshot Filter
              │  │ Sync   │  │   (projections, excludes,
              │  │ Filter │  │    data minimization)
              │  └────────┘  │
              └──────┬───────┘
                     │ H2A Protocol (authenticated)
                     ▼
              ┌──────────────┐
              │  H2A Agent   │
              └──────────────┘
```

Two security boundaries:
1. **Outbound (Host→Agent):** StateSnapshot filtering — agent only sees what's allowed
2. **Inbound (Agent→Host):** StateDelta sandboxing — agent can only do what's allowed

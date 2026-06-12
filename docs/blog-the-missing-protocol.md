# The Missing Protocol

*Why every AI-powered product is solving the same problem, and why we need a standard.*

## The Problem

In 2024, Anthropic released MCP. It standardized how agents talk to tools. In 2025, Google released A2A. It standardized how agents talk to other agents.

But nobody standardized how agents talk to humans.

Every AI product today invents its own protocol for the space between the agent and the UI. CopilotKit has one. Vercel AI SDK has another. OpenAI Assistants has a third. LangChain has a fourth. None of them talk to each other.

The result: agent backends are locked to specific frontends. Frontend SDKs are locked to specific agents. Developers pick a stack and pray they picked right.

This is the exact problem MCP solved for tools and A2A solved for agents. The same solution applies to humans.

## What H2A Is

H2A (Human-to-Agent Protocol) is the third protocol in the AI agent stack:

```
Human  ←── H2A ──→  Agent     (this one)
Agent  ←── A2A ──→  Agent     (Google/LF, 2025)
Agent  ←── MCP ──→  Tools     (Anthropic/LF, 2024)
```

H2A defines what flows between a frontend and an agent. Not how the agent thinks. Not what tools it uses. Just the wire format between the two.

## The Design

H2A uses SSE for agent-to-host streaming and HTTP POST for host-to-agent signals. No WebSocket. Works behind any CDN, any proxy, any load balancer.

Three primitives:

**AgentFrames** — the things agents send to humans. 10 typed frame types: text, tool_card, confirmation, progress, state_delta, toast, artifact, component, error, end. Each frame carries metadata: is it interruptible? revertible? what's the fallback text for screen readers?

**UserSignals** — the things humans send to agents. 8 signal types: message, confirm, deny, interrupt, redirect, context_change, feedback, session_switch. Structured, not just text.

**Presence** — agents are breathing entities, not request-response endpoints. Four states: rest, attentive, conversing, orchestrating. Presence drives UI: the indicator color, the animation speed, whether the agent is safe to interrupt.

## Why Not Just Use AG-UI?

CopilotKit's AG-UI (v0.0.52) defines 16 event types for agent-to-UI streaming. It's a good start. But it's missing several things that matter at protocol level:

**Security**: AG-UI has zero content sanitization requirements. No frame limits. No session validation. H2A specifies all of these.

**Accessibility**: AG-UI has no screen reader support, no reduced motion support, no fallback text. Every frame in H2A carries optional `fallbackText` and `narration` fields. The spec requires `aria-live` semantics for streaming content.

**Privacy**: AG-UI has no data minimization, no retention limits, no projection system. H2A lets the host declare exactly which fields to send via `stateRequirements.projections`.

**Conformance**: AG-UI is all-or-nothing. H2A has three levels (Basic, Standard, Full). Start with text streaming in 10 lines of code. Add presence when you're ready. Add orchestration when you need it.

**Presence**: AG-UI has no concept of agent state between messages. H2A's presence system makes agents feel alive.

The full alignment is documented in [h2a-agui-alignment.md](../spec/h2a-agui-alignment.md). All 16 AG-UI events map cleanly to H2A. The reverse is not true.

## Conformance Levels

Most protocols are all-or-nothing. Implement the whole thing or nothing works. This kills adoption.

H2A has three conformance levels:

**Basic** — Streaming text, interrupts, sessions. 10 lines of code. This is what most chat UIs need today.

**Standard** — Add presence, state sync, tool cards, confirmations. This is what copilot-style UIs need.

**Full** — Add UI orchestration, security hardening, accessibility, audit logging. This is what enterprise and safety-critical deployments need.

Each level is a strict superset of the one below. Every "Basic" agent works in every "Full" host.

## What Exists Today

The [h2a-protocol](https://github.com/PDangelmaier/h2a-protocol) repo contains:

- **Spec v0.1** with formal conformance levels, security addendum, test vectors, voice extension draft, and JSON schemas
- **@h2a/core** — TypeScript SDK with client, server, presence state machine, validation, and sanitization
- **@h2a/react** — React provider, hooks, PresenceIndicator, H2AChat component
- **@h2a/mock-agent** — 4 scenarios (echo, slow-stream, orchestrate, error) for testing
- **@h2a/vercel-ai** — Adapter for Vercel AI SDK's useChat
- **@h2a/langgraph** — Bridge for LangGraph agents
- **h2a (Python)** — Agent base class with FastAPI integration
- **Playground** — Interactive protocol explorer

26+ unit tests. Two complete SDKs. A working playground. Adapters for the two most popular agent frameworks.

## The Ask

H2A needs what MCP and A2A had: co-authors. People who build agent-powered products and feel the pain of incompatible protocols.

If you're building:
- A copilot, assistant, or agent-powered product
- A framework like LangChain, CrewAI, or AutoGen
- A host environment like VS Code, a browser extension, or a mobile app

...your feedback shapes the spec. Open an issue. Submit a PR. Join the RFC process.

The goal is not to replace anyone's SDK. The goal is to give every SDK a common wire format so the ecosystem composes instead of competing.

## Getting Started

```bash
# Try it in 30 seconds
npx @h2a/mock-agent &
# → Agent running on localhost:8100

# Open the playground
cd playground && pnpm dev
# → http://localhost:5200
```

Read the [spec](../spec/h2a-spec-v0.1.md). Build something. Tell us what's missing.

---

*H2A is MIT licensed. The spec, SDKs, and adapters are all open source.*
*Created by The1ne. Looking for co-authors and early adopters.*

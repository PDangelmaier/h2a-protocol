# H2A — Human-to-Agent Protocol

**The missing standard for human-agent interaction.**

MCP connects agents to tools. A2A connects agents to agents.  
H2A connects agents to humans — through any frontend, any framework, any device.

## Why H2A?

Every AI-powered application today invents its own agent-UI protocol.  
CopilotKit, Vercel AI SDK, OpenAI Assistants, LangChain — all incompatible.  
Developers rip out one, rebuild with another, repeat.

H2A standardizes **what flows between a frontend and an agent** so that:
- Agent backends become frontend-agnostic
- Frontend SDKs become agent-agnostic
- The ecosystem composes instead of competing

## The Three Layers of the AI Agent Stack

```
 Human        ←── H2A ──→   Agent
 Agent        ←── A2A ──→   Agent  
 Agent        ←── MCP ──→   Tools/Data
```

H2A does NOT replace MCP or A2A. It completes the stack.

## Quick Start

```bash
npm install @h2a/core @h2a/react
```

```tsx
import { H2AProvider, useAgent, usePresence } from '@h2a/react'

function App() {
  return (
    <H2AProvider endpoint="/api/agent">
      <YourApp />
      <AgentSurface />
    </H2AProvider>
  )
}
```

## Specification

| Document | What it covers |
|----------|---------------|
| [Core Spec](spec/h2a-spec-v0.1.md) | Protocol overview, primitives, transport, presence, privacy |
| [Conformance Levels](spec/h2a-conformance-levels.md) | Basic / Standard / Full — formal MUST/SHOULD/MAY |
| [Security Addendum](spec/h2a-security-addendum.md) | Sanitization, session security, frame limits, audit logs |
| [Test Vectors](spec/h2a-test-vectors.md) | Normative message exchanges for compliance testing |
| [Voice Extension](spec/h2a-voice-extension.md) | Turn-taking, STT/TTS, barge-in |
| [JSON Schemas](spec/schema/) | Machine-readable definitions for all types |

## Conformance Levels

```
H2A Basic    = Streaming text + interrupts + sessions
H2A Standard = + Presence + StateSync + ToolCards + Confirmations
H2A Full     = + Orchestration + Security hardening + Accessibility + Audit
```

Start with Basic (10 lines of code). Adopt more when you need it.

## Status

| Component | Status |
|-----------|--------|
| Core Spec v0.1 | Draft |
| Conformance Levels | Draft |
| Security Addendum | Draft |
| Test Vectors (8 scenarios) | Draft |
| Voice Extension | Draft |
| JSON Schemas (5) | Draft |
| Conformance Test Suite | Planned |
| React Host SDK | Planned |
| Python Agent Library | Planned |
| Vue / Svelte / Swift SDKs | Future |
| A2A / MCP Bridges | Future |

## License

MIT — use it, extend it, build on it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the RFC process, governance model, and areas that need help.

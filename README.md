# H2A — Human-to-Agent Protocol

**The missing standard for human-agent interaction.**

MCP connects agents to tools. A2A connects agents to agents.
H2A connects agents to humans.

```
 Human  ←── H2A ──→  Agent
 Agent  ←── A2A ──→  Agent
 Agent  ←── MCP ──→  Tools/Data
```

## Why

Every AI app today invents its own agent-UI protocol. CopilotKit, Vercel AI SDK, OpenAI Assistants, LangChain... all incompatible. Developers rip out one, rebuild with another, repeat.

H2A standardizes what flows between a frontend and an agent so that:
- Agent backends become frontend-agnostic
- Frontend SDKs become agent-agnostic
- The ecosystem composes instead of competing

## 30-Second Quick Start

### TypeScript (Host/Frontend)

```bash
npm install @h2a/core @h2a/react
```

```tsx
import { H2AProvider, H2AChat, PresenceIndicator, usePresence } from "@h2a/react";

function App() {
  return (
    <H2AProvider endpoint="http://localhost:8100">
      <PresenceIndicator />
      <H2AChat placeholder="Talk to the agent..." />
    </H2AProvider>
  );
}
```

### Python (Agent/Backend)

```bash
pip install h2a[fastapi]
```

```python
from h2a.agent import H2AAgent
from h2a.types import PresenceState
from h2a.fastapi_integration import create_h2a_routes
from fastapi import FastAPI

class MyAgent(H2AAgent):
    name = "My Agent"

    async def on_message(self, text, attachments=None):
        await self.set_presence(PresenceState.CONVERSING)
        await self.send_text(f"You said: {text}")
        await self.send_end()
        await self.set_presence(PresenceState.REST)

app = FastAPI()
app.include_router(create_h2a_routes(MyAgent()))
```

### TypeScript (Agent/Backend)

```bash
npx @h2a/mock-agent
# → Agent running on http://localhost:8100
```

## Architecture

```
┌─────────────────────────┐     SSE (frames, presence)     ┌──────────────────────┐
│                         │  ◄──────────────────────────    │                      │
│   HOST (Frontend)       │                                 │   AGENT (Backend)    │
│   @h2a/react            │     HTTP POST (signals)         │   @h2a/core          │
│   @h2a/core             │  ──────────────────────────►    │   h2a (Python)       │
│                         │                                 │                      │
│ • Renders AgentFrames   │     /.well-known/h2a-agent.json │ • Sends AgentFrames  │
│ • Shows presence state  │  ◄──────────────────────────    │ • Manages presence   │
│ • Sends UserSignals     │                                 │ • Handles signals    │
└─────────────────────────┘                                 └──────────────────────┘
```

**Transport:** SSE for agent→host streaming, HTTP POST for host→agent signals.
No WebSocket required. Works behind any CDN/proxy.

## Core Concepts

### Presence (4 states)

```
rest → attentive → conversing → orchestrating
```

The agent is a breathing presence, not a request-response endpoint. Presence states drive UI: breathing indicators, activity labels, timeout behavior.

### AgentFrames (10 types)

| Frame | Purpose |
|-------|---------|
| `text` | Streaming text (markdown, plain, HTML) |
| `tool_card` | Tool invocation with status |
| `confirmation` | Ask user to approve an action |
| `progress` | Task progress with percentage |
| `state_delta` | UI orchestration operations |
| `toast` | Transient notifications |
| `artifact` | Files, images, downloads |
| `component` | Custom UI components |
| `error` | Typed errors with retry hints |
| `end` | Marks response completion |

### UserSignals (8 types)

`message`, `confirm`, `deny`, `interrupt`, `redirect`, `context_change`, `feedback`, `session_switch`

### Conformance Levels

| Level | What you get |
|-------|-------------|
| **Basic** | Text streaming + interrupts + sessions |
| **Standard** | + Presence + StateSync + ToolCards + Confirmations |
| **Full** | + Orchestration + Security hardening + Accessibility |

Start with Basic. Adopt more when you need it.

## Packages

| Package | Description | Status |
|---------|------------|--------|
| [`@h2a/core`](packages/core) | Transport, types, validation, server, client | Published |
| [`@h2a/react`](packages/react) | Provider, hooks, components | Published |
| [`@h2a/mock-agent`](packages/mock-agent) | 4 scenarios, zero-dep test agent | Published |
| [`@h2a/vercel-ai`](adapters/vercel-ai) | Vercel AI SDK adapter (useChat compat) | Published |
| [`@h2a/langgraph`](adapters/langgraph) | LangGraph agent bridge | Published |
| [`h2a` (Python)](packages/python) | Agent base class, FastAPI integration | Published |
| [`playground`](playground) | Interactive protocol explorer | Dev |

## Adapters

### Vercel AI SDK

Drop H2A into any Next.js app using Vercel AI SDK:

```ts
import { H2AStream } from "@h2a/vercel-ai";

export async function POST(req: Request) {
  const stream = H2AStream({ endpoint: "http://agent:8100" });
  return new Response(stream);
}
```

### LangGraph

Expose any LangGraph agent via H2A:

```ts
import { createH2AHandler } from "@h2a/langgraph";
import http from "node:http";

const handler = createH2AHandler({
  invoke: (input) => myGraph.stream(input),
  agentName: "Research Agent",
});

http.createServer(handler).listen(8100);
```

## Specification

| Document | Coverage |
|----------|---------|
| [Core Spec v0.1](spec/h2a-spec-v0.1.md) | Protocol overview, primitives, transport, presence, privacy |
| [Conformance Levels](spec/h2a-conformance-levels.md) | Basic / Standard / Full with normative requirements |
| [Security Addendum](spec/h2a-security-addendum.md) | Sanitization, session security, frame limits, audit |
| [Test Vectors](spec/h2a-test-vectors.md) | 8 normative message exchanges |
| [Voice Extension](spec/h2a-voice-extension.md) | Turn-taking, STT/TTS, barge-in |
| [AG-UI Alignment](spec/h2a-agui-alignment.md) | CopilotKit event mapping, migration path |
| [v0.2 Changes](spec/h2a-spec-v0.2-changes.md) | RFC 2119 adoption, normative tightening |
| [JSON Schemas](spec/schema/) | Machine-readable type definitions |

## Comparison

| Feature | H2A | AG-UI | OpenAI Assistants | Custom |
|---------|-----|-------|-------------------|--------|
| Presence states | 4 + custom | None | None | N/A |
| Frame types | 10 | 16* | ~5 | Varies |
| Conformance levels | 3 | None | None | None |
| Content sanitization | Spec'd | None | None | Varies |
| Accessibility | Spec'd | None | None | Varies |
| Privacy controls | Spec'd | None | None | Varies |
| State observation | Bidirectional | None | None | Varies |
| UI orchestration | Tiered | None | None | Varies |
| Transport | SSE + HTTP | SSE | WebSocket | Varies |
| Open standard | Yes (MIT) | Partial | No | No |

*AG-UI's 16 events map to 10 H2A frame types. H2A adds confirmation, toast, artifact, and state_delta. See [alignment doc](spec/h2a-agui-alignment.md).

## The Three-Protocol Stack

```
┌─────────────────────────────────────────────┐
│                 HUMAN                        │
│            (Browser, Mobile, CLI)            │
└──────────────────┬──────────────────────────┘
                   │ H2A (frames, signals, presence)
                   ▼
┌─────────────────────────────────────────────┐
│                 AGENT                        │
│         (LangGraph, CrewAI, custom)          │
├──────────────┬──────────────────────────────┤
│     A2A      │           MCP                 │
│ (agent-agent)│     (agent-tools)             │
└──────┬───────┘──────────┬───────────────────┘
       ▼                  ▼
   Other Agents      Tools & Data
```

## Development

```bash
# Install
pnpm install

# Build all
pnpm -r build

# Test all
pnpm -r test

# Run playground
cd playground && pnpm dev

# Run mock agent
npx @h2a/mock-agent --port 8100
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

# @h2a/core

Core SDK for the [H2A (Human-to-Agent) Protocol](https://github.com/PDangelmaier/h2a-protocol).

## Install

```bash
npm install @h2a/core
```

## What's inside

- **Types** — AgentFrame (10 types), UserSignal (8 types), PresenceState, SessionOpen/Ack
- **H2AClient** — Connect to any H2A agent via SSE, send signals via HTTP POST
- **H2AServer** — Serve any agent via SSE with session management and capability negotiation
- **PresenceStateMachine** — 4-state presence (rest, attentive, conversing, orchestrating)
- **Validation** — Full message validation for all H2A types
- **Sanitization** — HTML sanitization for agent frames (XSS prevention)

## Quick Start

```typescript
import { H2AClient } from "@h2a/core";

const client = new H2AClient("http://localhost:8100");
await client.connect();

client.onFrame((frame) => {
  if (frame.frameType === "text") console.log(frame.content.text);
});

await client.sendSignal({ type: "message", content: { text: "Hello!" } });
```

## Part of the H2A Protocol Stack

```
Human  ←── H2A ──→  Agent
Agent  ←── A2A ──→  Agent
Agent  ←── MCP ──→  Tools
```

## License

MIT

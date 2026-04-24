# @h2a/langgraph

H2A adapter for LangGraph. Expose any LangGraph agent via H2A protocol.

## Install

```bash
npm install @h2a/langgraph @h2a/core
```

## Usage

### Quick Start (Node.js HTTP)

```ts
import { createH2AHandler } from "@h2a/langgraph";
import http from "node:http";

const handler = createH2AHandler({
  invoke: (input) => myGraph.stream(input),
  agentName: "Research Agent",
  domain: ["research", "analysis"],
});

http.createServer(handler).listen(8100);
// → H2A agent at http://localhost:8100
```

### With Express

```ts
import express from "express";
import { createH2AHandler } from "@h2a/langgraph";

const app = express();
app.use("/", createH2AHandler({ invoke: myGraph.stream.bind(myGraph) }));
app.listen(8100);
```

### Bridge API (Advanced)

For custom server setups, use the bridge directly:

```ts
import { H2ALangGraphBridge } from "@h2a/langgraph";

const bridge = new H2ALangGraphBridge({
  h2a: myH2AServer,
  sessionId: "session-123",
  toolFrameEnabled: true,
  progressEnabled: true,
});

// Process a LangGraph event stream
await bridge.processStream(langGraphEvents);
```

## Event Mapping

| LangGraph Event | H2A Frame |
|----------------|-----------|
| `on_llm_stream` | `text` (streaming) |
| `on_llm_end` | `text` (final) |
| `on_tool_start` | `tool_card` (running) |
| `on_tool_end` | `tool_card` (completed) |
| `on_chain_start` | `progress` |
| `on_chain_end` | (implicit) |

Presence transitions: `conversing` during LLM streaming, `orchestrating` during tool calls, `rest` after completion.

## License

MIT

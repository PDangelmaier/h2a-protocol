# h2a

Python server library for the [H2A (Human-to-Agent) Protocol](https://github.com/PDangelmaier/h2a-protocol).

Build H2A-compliant agents in Python. Works with any frontend that speaks H2A.

## Install

```bash
pip install h2a[fastapi]
```

## Quick Start

```python
from h2a.agent import H2AAgent
from h2a.types import PresenceState
from h2a.fastapi_integration import create_h2a_routes
from fastapi import FastAPI

class MyAgent(H2AAgent):
    name = "My Agent"
    description = "A simple H2A agent"

    async def on_message(self, text, attachments=None):
        await self.set_presence(PresenceState.CONVERSING)
        await self.send_text(f"You said: {text}")
        await self.send_end()
        await self.set_presence(PresenceState.REST)

app = FastAPI()
app.include_router(create_h2a_routes(MyAgent()))
```

```bash
uvicorn myagent:app --port 8100
```

## What's inside

- **H2AAgent** — Base class for building agents. Handles sessions, presence, frame sending.
- **FastAPI integration** — `create_h2a_routes()` adds SSE + POST endpoints with CORS.
- **Types** — All H2A types as Python dataclasses (AgentFrame, UserSignal, PresenceState).
- **Validation** — Message validation matching the H2A spec.

## Part of the H2A Protocol Stack

```
Human  ←── H2A ──→  Agent     (this library)
Agent  ←── A2A ──→  Agent
Agent  ←── MCP ──→  Tools
```

## License

MIT

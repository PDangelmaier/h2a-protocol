"""
H2A Python Server — Minimal Echo Agent

Shows the developer experience: pip install h2a[fastapi], 30 lines, working agent.

    pip install h2a[fastapi]
    python h2a_server_example.py
    → Agent running on http://localhost:8100
"""

from __future__ import annotations

import asyncio

from h2a.agent import H2AAgent
from h2a.types import PresenceState
from h2a.fastapi_integration import create_h2a_routes

try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
except ImportError:
    raise SystemExit("Install dependencies: pip install h2a[fastapi]")


class EchoAgent(H2AAgent):
    name = "Echo Agent"
    description = "Echoes user messages with presence transitions"
    domain = ["demo", "testing"]

    async def on_message(self, text: str, attachments=None):
        self._interrupted = False
        await self.set_presence(PresenceState.CONVERSING, trigger="user_message")

        words = f'Echo: "{text}"'.split()
        for i, word in enumerate(words):
            if self._interrupted:
                await self.send_text(" [interrupted]", streaming=True, final=True)
                break
            chunk = word + (" " if i < len(words) - 1 else "")
            await self.send_text(chunk, streaming=True, final=(i == len(words) - 1))
            await asyncio.sleep(0.05)

        await self.send_end()
        await self.set_presence(PresenceState.REST, trigger="response_complete")


app = FastAPI(title="H2A Echo Agent")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"], expose_headers=["X-H2A-Session"])

agent = EchoAgent()
app.include_router(create_h2a_routes(agent))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8100)

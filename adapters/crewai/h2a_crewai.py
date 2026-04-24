"""
H2A adapter for CrewAI — expose multi-agent crews via H2A protocol.

Usage:
    from h2a_crewai import H2ACrewAgent
    from crewai import Crew, Agent, Task

    crew = Crew(agents=[...], tasks=[...])
    h2a_agent = H2ACrewAgent(crew=crew, name="Research Team")
    app = h2a_agent.create_app()

    # Run with: uvicorn app:app --port 8100
"""

from __future__ import annotations

import asyncio
from typing import Any

from h2a.agent import H2AAgent
from h2a.types import PresenceState
from h2a.fastapi_integration import create_h2a_routes


class H2ACrewAgent(H2AAgent):
    """Wraps a CrewAI Crew as an H2A agent.

    Each crew member gets its own tool_card frame showing what it's working on.
    Presence transitions to 'orchestrating' when multiple agents are active.
    """

    def __init__(self, crew: Any, name: str = "CrewAI Agent", domain: list[str] | None = None):
        super().__init__()
        self.crew = crew
        self.name = name
        self.description = f"CrewAI crew with {len(getattr(crew, 'agents', []))} agents"
        self.domain = domain or ["multi-agent"]

    async def on_message(self, text: str, attachments: Any = None) -> None:
        self._interrupted = False
        await self.set_presence(PresenceState.CONVERSING, trigger="user_message")

        try:
            await self.set_presence(PresenceState.ORCHESTRATING, trigger="crew_kickoff")
            result = await self._run_crew(text)
            await self.set_presence(PresenceState.CONVERSING, trigger="crew_complete")

            if isinstance(result, str):
                await self._stream_text(result)
            else:
                await self.send_text(str(result))

        except Exception as e:
            await self.send_frame(
                self._make_frame("error", {"code": "INTERNAL_ERROR", "message": str(e)})
            )

        await self.send_end()
        await self.set_presence(PresenceState.REST, trigger="response_complete")

    async def _run_crew(self, input_text: str) -> Any:
        """Run the crew in a thread pool to avoid blocking the event loop."""
        loop = asyncio.get_event_loop()

        agents = getattr(self.crew, "agents", [])
        for agent in agents:
            agent_name = getattr(agent, "role", "agent")
            await self.send_frame(
                self._make_frame(
                    "tool_card",
                    {"tool": agent_name, "status": "running", "input": {"task": input_text}},
                )
            )

        result = await loop.run_in_executor(None, lambda: self.crew.kickoff(inputs={"input": input_text}))

        for agent in agents:
            agent_name = getattr(agent, "role", "agent")
            await self.send_frame(
                self._make_frame("tool_card", {"tool": agent_name, "status": "completed"})
            )

        return result

    async def _stream_text(self, text: str) -> None:
        words = text.split()
        for i, word in enumerate(words):
            if self._interrupted:
                await self.send_text(" [interrupted]", streaming=True, final=True)
                return
            chunk = word + (" " if i < len(words) - 1 else "")
            await self.send_text(chunk, streaming=True, final=(i == len(words) - 1))
            await asyncio.sleep(0.02)

    def _make_frame(self, frame_type: str, content: dict) -> Any:
        from h2a.types import AgentFrame, FrameType

        return AgentFrame(
            frame_type=FrameType(frame_type) if frame_type in FrameType.__members__.values() else FrameType.TEXT,
            content=content,
        )

    def create_app(self, port: int = 8100) -> Any:
        """Create a FastAPI app ready to serve this crew via H2A."""
        try:
            from fastapi import FastAPI
            from fastapi.middleware.cors import CORSMiddleware
        except ImportError:
            raise ImportError("Install h2a[fastapi] for FastAPI integration")

        app = FastAPI(title=f"H2A: {self.name}")
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-H2A-Session"],
        )
        app.include_router(create_h2a_routes(self))
        return app

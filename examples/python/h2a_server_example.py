"""
H2A Python Server — Example Agent Implementation

Shows how an agent backend implements the H2A protocol.
This is the developer experience H2A targets for backend developers.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncIterator

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse


# ── H2A Core Types (planned: pip install h2a) ──


class PresenceState(str, Enum):
    REST = "rest"
    ATTENTIVE = "attentive"
    CONVERSING = "conversing"
    ORCHESTRATING = "orchestrating"


class FrameType(str, Enum):
    TEXT = "text"
    TOOL_CARD = "tool_card"
    CONFIRMATION = "confirmation"
    PROGRESS = "progress"
    STATE_DELTA = "state_delta"
    TOAST = "toast"
    ARTIFACT = "artifact"
    ERROR = "error"
    END = "end"


@dataclass
class AgentFrame:
    frame_type: FrameType
    content: Any
    streaming: bool = False
    final: bool = True
    interruptible: bool = True
    revertible: bool = False
    narration: str | None = None
    fallback_text: str | None = None
    id: str = field(default_factory=lambda: f"frm_{uuid.uuid4().hex[:8]}")

    def to_sse(self) -> str:
        data = {
            "type": "agent.frame",
            "id": self.id,
            "frameType": self.frame_type.value,
            "content": self.content,
            "streaming": self.streaming,
            "final": self.final,
            "metadata": {
                "interruptible": self.interruptible,
                "revertible": self.revertible,
            },
        }
        if self.narration:
            data["metadata"]["narration"] = self.narration
        if self.fallback_text:
            data["fallbackText"] = self.fallback_text
        return f"event: agent.frame\nid: {self.id}\ndata: {json.dumps(data)}\n\n"


@dataclass
class PresenceUpdate:
    state: PresenceState
    confidence: float = 1.0
    trigger: str | None = None

    def to_sse(self) -> str:
        data = {
            "type": "presence.update",
            "state": self.state.value,
            "confidence": self.confidence,
        }
        if self.trigger:
            data["trigger"] = self.trigger
        prs_id = f"prs_{uuid.uuid4().hex[:8]}"
        return f"event: presence.update\nid: {prs_id}\ndata: {json.dumps(data)}\n\n"


@dataclass
class StateSnapshot:
    page: dict[str, str]
    data: dict[str, Any]
    user: dict[str, Any]
    timestamp: str


# ── H2A Base Agent (planned: from h2a import H2AAgent) ──


class H2AAgent:
    name: str = "Agent"
    domain: list[str] = []
    version: str = "0.1"

    def __init__(self):
        self._frame_queue: asyncio.Queue[str] = asyncio.Queue()
        self._interrupted = False
        self._current_state = PresenceState.REST
        self._last_snapshot: StateSnapshot | None = None

    async def set_presence(self, state: PresenceState, trigger: str | None = None):
        self._current_state = state
        update = PresenceUpdate(state=state, trigger=trigger)
        await self._frame_queue.put(update.to_sse())

    async def send_frame(self, frame: AgentFrame):
        if self._interrupted and frame.interruptible:
            return
        await self._frame_queue.put(frame.to_sse())

    async def send_text(self, text: str, streaming: bool = False, final: bool = True):
        frame = AgentFrame(
            frame_type=FrameType.TEXT,
            content=text,
            streaming=streaming,
            final=final,
        )
        await self.send_frame(frame)

    async def send_toast(self, message: str, severity: str = "info"):
        frame = AgentFrame(
            frame_type=FrameType.TOAST,
            content={"message": message, "severity": severity},
            fallback_text=f"[{severity}] {message}",
        )
        await self.send_frame(frame)

    async def request_confirmation(
        self, action: str, description: str, options: list[dict]
    ) -> AgentFrame:
        frame = AgentFrame(
            frame_type=FrameType.CONFIRMATION,
            content={
                "action": action,
                "description": description,
                "options": options,
            },
            fallback_text=f"Confirm: {description}",
        )
        await self.send_frame(frame)
        return frame

    async def orchestrate(self, operations: list[dict], narration: str):
        frame = AgentFrame(
            frame_type=FrameType.STATE_DELTA,
            content={"operations": operations},
            narration=narration,
            revertible=True,
            fallback_text=narration,
        )
        await self.send_frame(frame)

    async def send_end(self, reason: str = "complete"):
        frame = AgentFrame(
            frame_type=FrameType.END, content={"reason": reason}, final=True
        )
        await self.send_frame(frame)

    async def on_state_snapshot(self, snapshot: StateSnapshot):
        """Override: called when Host sends state update."""
        pass

    async def on_message(self, text: str, attachments: list | None = None):
        """Override: called when user sends a message."""
        pass

    async def on_interrupt(self):
        """Override: called when user interrupts."""
        self._interrupted = True

    async def on_confirm(self, frame_id: str, choice: str):
        """Override: called when user confirms an action."""
        pass

    def agent_card(self) -> dict:
        return {
            "h2a": self.version,
            "name": self.name,
            "domain": self.domain,
            "capabilities": {
                "streaming": True,
                "presence": True,
                "stateObservation": True,
                "uiOrchestration": True,
                "interruptible": True,
            },
            "presence": {
                "states": [s.value for s in PresenceState],
                "defaultState": "rest",
            },
            "frameTypes": [ft.value for ft in FrameType],
        }

    async def stream(self) -> AsyncIterator[str]:
        while True:
            try:
                event = await asyncio.wait_for(self._frame_queue.get(), timeout=30)
                yield event
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"


# ── Example: Project Management Agent ──


class AtlasAgent(H2AAgent):
    name = "Atlas"
    domain = ["project-management", "task-tracking"]

    async def on_state_snapshot(self, snapshot: StateSnapshot):
        self._last_snapshot = snapshot

        if snapshot.user.get("activity") == "idle":
            idle = snapshot.user.get("idleSeconds", 0)
            if idle > 60 and snapshot.page.get("section") == "task-board":
                await self.set_presence(
                    PresenceState.ATTENTIVE,
                    trigger=f"User idle {idle}s on task board",
                )
                await self.send_toast(
                    "You've been idle for a minute. Need help prioritizing?"
                )

        overdue = snapshot.data.get("overdueCount", 0)
        if overdue > 0:
            await self.set_presence(
                PresenceState.ATTENTIVE, trigger="Overdue tasks detected"
            )
            await self.send_toast(
                f"{overdue} tasks are overdue. Want me to suggest a plan?",
                severity="warning",
            )

    async def on_message(self, text: str, attachments: list | None = None):
        self._interrupted = False
        await self.set_presence(PresenceState.CONVERSING)

        lower = text.lower()

        if any(cmd in lower for cmd in ["create", "add", "move", "assign", "start"]):
            await self.set_presence(PresenceState.ORCHESTRATING, trigger=text)
            await self._handle_orchestration(text)
        else:
            await self._handle_conversation(text)

        await self.send_end()
        await self.set_presence(PresenceState.REST)

    async def _handle_conversation(self, text: str):
        response = f"Looking into that: '{text}'. Let me check..."
        words = response.split()
        for i, word in enumerate(words):
            if self._interrupted:
                await self.send_text(" [interrupted]", streaming=True, final=True)
                return
            chunk = word + (" " if i < len(words) - 1 else "")
            await self.send_text(chunk, streaming=True, final=(i == len(words) - 1))
            await asyncio.sleep(0.05)

    async def _handle_orchestration(self, text: str):
        await self.send_text("Got it. Working on that...")

        await self.request_confirmation(
            action="create_task",
            description=f"Should I create a task based on '{text}'?",
            options=[
                {"id": "yes", "label": "Yes, create it", "default": True},
                {"id": "no", "label": "Cancel"},
            ],
        )

        await self.orchestrate(
            operations=[
                {"op": "navigate", "target": "/tasks/new"},
                {"op": "fill", "target": "title", "value": "New task from Atlas"},
                {"op": "fill", "target": "priority", "value": "high"},
            ],
            narration=f"Creating task based on: {text}",
        )

    async def on_interrupt(self):
        await super().on_interrupt()
        await self.set_presence(PresenceState.REST, trigger="User interrupted")


# ── FastAPI Server ──

app = FastAPI(title="H2A Example Agent")
agent = AtlasAgent()


@app.get("/.well-known/h2a-agent.json")
async def get_agent_card():
    return agent.agent_card()


@app.post("/h2a/session")
async def open_session(request: Request):
    body = await request.json()
    session_id = body.get("sessionId", f"ses_{uuid.uuid4().hex[:8]}")

    return StreamingResponse(
        agent.stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-H2A-Session": session_id,
        },
    )


@app.post("/h2a/signal")
async def receive_signal(request: Request):
    body = await request.json()
    signal_type = body.get("signalType")

    if signal_type == "message":
        text = body.get("content", {})
        if isinstance(text, str):
            asyncio.create_task(agent.on_message(text))
        else:
            asyncio.create_task(agent.on_message(text.get("text", "")))

    elif signal_type == "interrupt":
        asyncio.create_task(agent.on_interrupt())

    elif signal_type == "confirm":
        frame_id = body.get("content", {}).get("frameId", "")
        choice = body.get("content", {}).get("choice", "")
        asyncio.create_task(agent.on_confirm(frame_id, choice))

    elif signal_type == "context_change":
        snapshot_data = body.get("content", {})
        snapshot = StateSnapshot(
            page=snapshot_data.get("page", {}),
            data=snapshot_data.get("data", {}),
            user=snapshot_data.get("user", {}),
            timestamp=snapshot_data.get("timestamp", ""),
        )
        asyncio.create_task(agent.on_state_snapshot(snapshot))

    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8100)

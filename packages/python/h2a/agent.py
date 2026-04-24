"""H2A base agent with session management, frame sending, and presence."""

from __future__ import annotations

import asyncio
import secrets
import uuid
from typing import Any, AsyncIterator

from h2a.types import (
    AgentCard,
    AgentFrame,
    ConformanceLevel,
    FrameType,
    PresenceState,
    PresenceUpdate,
    SessionAck,
    SessionOpen,
    StateDeltaOperation,
    StateSnapshot,
)


class H2AAgent:
    """Base class for H2A-compatible agents. Subclass and override on_* methods."""

    name: str = "Agent"
    description: str = ""
    domain: list[str] = []
    version: str = "0.1"
    conformance: ConformanceLevel = ConformanceLevel.BASIC

    def __init__(self) -> None:
        self._frame_queue: asyncio.Queue[str] = asyncio.Queue()
        self._interrupted = False
        self._presence = PresenceState.REST
        self._sequence = 0
        self._session_id: str | None = None
        self._last_snapshot: StateSnapshot | None = None

    # ── Session ──

    def open_session(self, session_open: SessionOpen) -> SessionAck:
        self._session_id = f"ses_{secrets.token_hex(12)}"
        self._sequence = 0
        self._interrupted = False
        self._presence = PresenceState.REST

        negotiated = {
            "frameTypes": [ft.value for ft in FrameType],
            "conformanceLevel": self.conformance.value,
            "presence": True,
            "stateSync": True,
        }

        ack = SessionAck(
            session_id=self._session_id,
            negotiated_capabilities=negotiated,
        )
        return ack

    # ── Sending ──

    async def set_presence(
        self, state: PresenceState, trigger: str | None = None, confidence: float = 1.0
    ) -> None:
        self._presence = state
        update = PresenceUpdate(state=state, confidence=confidence, trigger=trigger)
        await self._frame_queue.put(update.to_sse())

    async def send_frame(self, frame: AgentFrame) -> None:
        if self._interrupted and frame.interruptible:
            return
        self._sequence += 1
        frame.sequence = self._sequence
        await self._frame_queue.put(frame.to_sse())

    async def send_text(
        self, text: str, streaming: bool = False, final: bool = True
    ) -> None:
        await self.send_frame(
            AgentFrame(frame_type=FrameType.TEXT, content=text, streaming=streaming, final=final)
        )

    async def send_toast(
        self, message: str, severity: str = "info", duration: int = 5000
    ) -> None:
        await self.send_frame(
            AgentFrame(
                frame_type=FrameType.TOAST,
                content={"message": message, "severity": severity, "duration": duration},
                fallback_text=f"[{severity}] {message}",
            )
        )

    async def send_tool_card(
        self, tool: str, status: str, output: Any = None, duration: float | None = None
    ) -> None:
        content: dict[str, Any] = {"tool": tool, "status": status}
        if output is not None:
            content["output"] = output
        if duration is not None:
            content["duration"] = duration
        await self.send_frame(
            AgentFrame(
                frame_type=FrameType.TOOL_CARD,
                content=content,
                fallback_text=f"Tool '{tool}': {status}",
            )
        )

    async def send_confirmation(
        self,
        action: str,
        description: str,
        options: list[dict[str, Any]],
        tier: str = "confirmable",
        timeout: int | None = None,
    ) -> AgentFrame:
        content: dict[str, Any] = {
            "action": action,
            "description": description,
            "options": options,
            "tier": tier,
        }
        if timeout:
            content["timeout"] = timeout

        frame = AgentFrame(
            frame_type=FrameType.CONFIRMATION,
            content=content,
            fallback_text=f"Confirm: {description}",
        )
        await self.send_frame(frame)
        return frame

    async def send_progress(
        self, task: str, percent: float, message: str | None = None
    ) -> None:
        content: dict[str, Any] = {"task": task, "percent": percent}
        if message:
            content["message"] = message
        await self.send_frame(
            AgentFrame(
                frame_type=FrameType.PROGRESS,
                content=content,
                fallback_text=f"{task}: {percent:.0f}%",
            )
        )

    async def send_state_delta(
        self,
        operations: list[StateDeltaOperation],
        narration: str,
        revert_operations: list[StateDeltaOperation] | None = None,
        mode: str = "sequential",
    ) -> None:
        await self.send_frame(
            AgentFrame(
                frame_type=FrameType.STATE_DELTA,
                content={"mode": mode, "operations": [op.to_dict() for op in operations]},
                narration=narration,
                revertible=revert_operations is not None,
                revert_operations=revert_operations,
                fallback_text=narration,
            )
        )

    async def send_error(
        self, code: str, message: str, retry_after: int | None = None
    ) -> None:
        content: dict[str, Any] = {"code": code, "message": message, "severity": "error"}
        if retry_after:
            content["retryAfter"] = retry_after
        await self.send_frame(
            AgentFrame(
                frame_type=FrameType.ERROR,
                content=content,
                fallback_text=f"Error: {message}",
            )
        )

    async def send_end(self, reason: str = "complete") -> None:
        await self.send_frame(
            AgentFrame(frame_type=FrameType.END, content={"reason": reason}, final=True)
        )

    # ── Event Handlers (override in subclass) ──

    async def on_state_snapshot(self, snapshot: StateSnapshot) -> None:
        self._last_snapshot = snapshot

    async def on_message(self, text: str, attachments: list[Any] | None = None) -> None:
        pass

    async def on_interrupt(self) -> None:
        self._interrupted = True

    async def on_confirm(self, frame_id: str, choice: str) -> None:
        pass

    async def on_deny(self, frame_id: str, reason: str | None = None) -> None:
        pass

    # ── AgentCard ──

    def agent_card(self) -> dict[str, Any]:
        card = AgentCard(
            h2a=self.version,
            name=self.name,
            description=self.description,
            domain=self.domain,
            capabilities={
                "streaming": True,
                "presence": True,
                "stateObservation": True,
                "uiOrchestration": self.conformance == ConformanceLevel.FULL,
                "interruptible": True,
            },
            conformance=self.conformance,
            endpoint={"h2a": ""},
            presence={
                "states": [s.value for s in PresenceState],
                "defaultState": "rest",
            },
            frame_types=[ft.value for ft in FrameType],
        )
        return card.to_dict()

    # ── Health ──

    def health(self) -> dict[str, Any]:
        return {
            "status": "healthy",
            "h2a": self.version,
            "agent": {
                "name": self.name,
                "conformance": self.conformance.value,
            },
            "activeSessions": 1 if self._session_id else 0,
            "checks": {},
        }

    # ── SSE Stream ──

    async def stream(self) -> AsyncIterator[str]:
        while True:
            try:
                event = await asyncio.wait_for(self._frame_queue.get(), timeout=30)
                yield event
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"

"""FastAPI integration for H2A agents."""

from __future__ import annotations

import asyncio
from typing import Any

from h2a.agent import H2AAgent
from h2a.types import SessionOpen, StateSnapshot


def create_h2a_routes(agent: H2AAgent, prefix: str = "", cors: bool = True) -> Any:
    """Create FastAPI router with H2A endpoints.

    Usage:
        app = FastAPI()
        agent = MyAgent()
        app.include_router(create_h2a_routes(agent))
    """
    try:
        from fastapi import APIRouter, Request
        from fastapi.responses import JSONResponse, StreamingResponse
    except ImportError as e:
        raise ImportError("Install h2a[fastapi] for FastAPI integration") from e

    router = APIRouter(prefix=prefix)

    if cors:
        from fastapi.middleware.cors import CORSMiddleware

        @router.options("/{path:path}")
        async def cors_preflight(request: Request) -> JSONResponse:
            return JSONResponse(
                {},
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, X-H2A-Session",
                    "Access-Control-Expose-Headers": "X-H2A-Session",
                },
            )

    @router.get("/.well-known/h2a-agent.json")
    async def get_agent_card() -> JSONResponse:
        card = agent.agent_card()
        card["endpoint"]["h2a"] = f"{prefix}/h2a"
        card["endpoint"]["agentCard"] = f"{prefix}/.well-known/h2a-agent.json"
        return JSONResponse(card)

    @router.post("/h2a/session")
    async def open_session(request: Request) -> StreamingResponse:
        body = await request.json()
        msg_type = body.get("type", "session.open")

        if msg_type == "session.resume":
            session_id = body.get("sessionId", "")
            last_seq = body.get("lastReceivedSequence", 0)
            # Resume logic — for now, just re-stream
            pass

        session_open = SessionOpen(
            host_capabilities=body.get("hostCapabilities", {"rendering": ["text"]}),
            session_id=body.get("sessionId"),
            locale=body.get("locale", "en-US"),
        )

        ack = agent.open_session(session_open)

        async def stream():
            yield ack.to_sse()
            async for event in agent.stream():
                yield event

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-H2A-Session": ack.session_id,
            },
        )

    @router.post("/h2a/signal")
    async def receive_signal(request: Request) -> JSONResponse:
        body = await request.json()
        signal_type = body.get("signalType")

        if signal_type == "message":
            content = body.get("content", {})
            text = content.get("text", "") if isinstance(content, dict) else str(content)
            attachments = body.get("context", {}).get("attachments")
            asyncio.create_task(agent.on_message(text, attachments))

        elif signal_type == "interrupt":
            asyncio.create_task(agent.on_interrupt())

        elif signal_type == "confirm":
            content = body.get("content", {})
            asyncio.create_task(
                agent.on_confirm(content.get("frameId", ""), content.get("choice", ""))
            )

        elif signal_type == "deny":
            content = body.get("content", {})
            asyncio.create_task(
                agent.on_deny(content.get("frameId", ""), content.get("reason"))
            )

        elif signal_type == "context_change":
            content = body.get("content", {})
            snapshot = StateSnapshot(
                timestamp=content.get("timestamp", ""),
                page=content.get("page", {}),
                data=content.get("data", {}),
                user=content.get("user", {}),
            )
            asyncio.create_task(agent.on_state_snapshot(snapshot))

        return JSONResponse({"ok": True})

    @router.get("/h2a/health")
    async def health_check() -> JSONResponse:
        return JSONResponse(agent.health())

    return router

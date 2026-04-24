"""H2A Protocol type definitions."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


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
    COMPONENT = "component"
    ERROR = "error"
    END = "end"


class SignalType(str, Enum):
    MESSAGE = "message"
    CONFIRM = "confirm"
    DENY = "deny"
    INTERRUPT = "interrupt"
    REDIRECT = "redirect"
    CONTEXT_CHANGE = "context_change"
    FEEDBACK = "feedback"
    SESSION_SWITCH = "session_switch"


class ConformanceLevel(str, Enum):
    BASIC = "basic"
    STANDARD = "standard"
    FULL = "full"


class H2AErrorCode(str, Enum):
    SESSION_EXPIRED = "SESSION_EXPIRED"
    RATE_LIMITED = "RATE_LIMITED"
    ORCHESTRATION_DENIED = "ORCHESTRATION_DENIED"
    STATE_SYNC_ERROR = "STATE_SYNC_ERROR"
    AGENT_OVERLOADED = "AGENT_OVERLOADED"
    UNSUPPORTED_FRAME = "UNSUPPORTED_FRAME"
    AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


@dataclass
class AgentCard:
    h2a: str
    name: str
    capabilities: dict[str, Any]
    endpoint: dict[str, str]
    description: str = ""
    domain: list[str] = field(default_factory=list)
    conformance: ConformanceLevel = ConformanceLevel.BASIC
    presence: dict[str, Any] | None = None
    frame_types: list[str] | None = None
    state_requirements: dict[str, Any] | None = None
    authentication: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "h2a": self.h2a,
            "name": self.name,
            "description": self.description,
            "domain": self.domain,
            "capabilities": self.capabilities,
            "conformance": self.conformance.value,
            "endpoint": self.endpoint,
        }
        if self.presence:
            d["presence"] = self.presence
        if self.frame_types:
            d["frameTypes"] = self.frame_types
        if self.state_requirements:
            d["stateRequirements"] = self.state_requirements
        if self.authentication:
            d["authentication"] = self.authentication
        return d


@dataclass
class SessionOpen:
    host_capabilities: dict[str, Any]
    session_id: str | None = None
    locale: str = "en-US"
    timezone: str | None = None


@dataclass
class SessionAck:
    session_id: str
    negotiated_capabilities: dict[str, Any]

    def to_sse(self) -> str:
        import json

        data = {
            "type": "session.ack",
            "sessionId": self.session_id,
            "negotiatedCapabilities": self.negotiated_capabilities,
        }
        return f"event: session.ack\ndata: {json.dumps(data)}\n\n"


@dataclass
class StateSnapshot:
    timestamp: str
    page: dict[str, str] = field(default_factory=dict)
    data: dict[str, Any] = field(default_factory=dict)
    user: dict[str, Any] = field(default_factory=dict)


@dataclass
class StateDeltaOperation:
    op: str
    target: str
    value: Any = None
    timeout: int | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"op": self.op, "target": self.target}
        if self.value is not None:
            d["value"] = self.value
        if self.timeout is not None:
            d["timeout"] = self.timeout
        return d


@dataclass
class AgentFrame:
    frame_type: FrameType
    content: Any
    streaming: bool = False
    final: bool = True
    interruptible: bool = True
    revertible: bool = False
    revert_operations: list[StateDeltaOperation] | None = None
    narration: str | None = None
    fallback_text: str | None = None
    id: str = ""
    sequence: int = 0

    def __post_init__(self) -> None:
        if not self.id:
            import uuid
            self.id = f"frm_{uuid.uuid4().hex[:8]}"

    def to_sse(self) -> str:
        import json

        data: dict[str, Any] = {
            "type": "agent.frame",
            "id": self.id,
            "sequence": self.sequence,
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
        if self.revert_operations:
            data["metadata"]["revertOperations"] = [op.to_dict() for op in self.revert_operations]
        if self.fallback_text:
            data["fallbackText"] = self.fallback_text
        return f"event: agent.frame\nid: {self.id}\ndata: {json.dumps(data)}\n\n"


@dataclass
class PresenceUpdate:
    state: PresenceState
    confidence: float = 1.0
    trigger: str | None = None

    def to_sse(self) -> str:
        import json
        import uuid

        data: dict[str, Any] = {
            "type": "presence.update",
            "state": self.state.value,
            "confidence": self.confidence,
        }
        if self.trigger:
            data["trigger"] = self.trigger
        prs_id = f"prs_{uuid.uuid4().hex[:8]}"
        return f"event: presence.update\nid: {prs_id}\ndata: {json.dumps(data)}\n\n"


@dataclass
class UserSignal:
    signal_type: SignalType
    content: Any = None
    context: dict[str, Any] | None = None


@dataclass
class TextContent:
    text: str
    format: str = "markdown"


@dataclass
class ToolCardContent:
    tool: str
    status: str
    input: dict[str, Any] | None = None
    output: Any = None
    duration: float | None = None


@dataclass
class ConfirmationContent:
    action: str
    description: str
    options: list[dict[str, Any]]
    tier: str = "confirmable"
    timeout: int | None = None


@dataclass
class ProgressContent:
    task: str
    percent: float | None = None
    message: str | None = None


@dataclass
class ToastContent:
    message: str
    severity: str = "info"
    duration: int = 5000


@dataclass
class ErrorContent:
    code: H2AErrorCode
    message: str
    retry_after: int | None = None
    severity: str = "error"


@dataclass
class StateDeltaContent:
    operations: list[StateDeltaOperation]
    mode: str = "sequential"
    on_failure: str = "stop"

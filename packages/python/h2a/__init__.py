"""H2A Protocol — Python server library for agent backends."""

from h2a.types import (
    AgentCard,
    AgentFrame,
    ConfirmationContent,
    ConformanceLevel,
    ErrorContent,
    FrameType,
    H2AErrorCode,
    PresenceState,
    PresenceUpdate,
    ProgressContent,
    SessionAck,
    SessionOpen,
    SignalType,
    StateDeltaContent,
    StateDeltaOperation,
    StateSnapshot,
    TextContent,
    ToastContent,
    ToolCardContent,
    UserSignal,
)
from h2a.agent import H2AAgent
from h2a.validate import validate_message, validate_agent_card, validate_agent_frame

__version__ = "0.1.0"
__all__ = [
    "AgentCard",
    "AgentFrame",
    "ConfirmationContent",
    "ConformanceLevel",
    "ErrorContent",
    "FrameType",
    "H2AAgent",
    "H2AErrorCode",
    "PresenceState",
    "PresenceUpdate",
    "ProgressContent",
    "SessionAck",
    "SessionOpen",
    "SignalType",
    "StateDeltaContent",
    "StateDeltaOperation",
    "StateSnapshot",
    "TextContent",
    "ToastContent",
    "ToolCardContent",
    "UserSignal",
    "validate_agent_card",
    "validate_agent_frame",
    "validate_message",
]

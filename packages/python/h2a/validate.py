"""H2A message validation utilities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ValidationResult:
    valid: bool
    errors: list[str]


def _fail(*errors: str) -> ValidationResult:
    return ValidationResult(valid=False, errors=list(errors))


def _ok() -> ValidationResult:
    return ValidationResult(valid=True, errors=[])


def validate_message(message: dict[str, Any]) -> ValidationResult:
    if not isinstance(message, dict):
        return _fail("Message must be a dict")

    msg_type = message.get("type")
    if not isinstance(msg_type, str):
        return _fail("Missing or invalid 'type' field")

    validators = {
        "session.open": validate_session_open,
        "session.ack": validate_session_ack,
        "state.snapshot": validate_state_snapshot,
        "agent.frame": validate_agent_frame,
        "user.signal": validate_user_signal,
        "presence.update": validate_presence_update,
    }

    validator = validators.get(msg_type)
    if not validator:
        return _fail(f"Unknown message type: {msg_type}")

    return validator(message)


def validate_session_open(msg: dict[str, Any]) -> ValidationResult:
    errors: list[str] = []
    if not msg.get("hostCapabilities"):
        errors.append("hostCapabilities is required")
    caps = msg.get("hostCapabilities", {})
    if not isinstance(caps.get("rendering"), list):
        errors.append("hostCapabilities.rendering must be a list")
    return _fail(*errors) if errors else _ok()


def validate_session_ack(msg: dict[str, Any]) -> ValidationResult:
    errors: list[str] = []
    if not msg.get("sessionId"):
        errors.append("sessionId is required")
    if not msg.get("negotiatedCapabilities"):
        errors.append("negotiatedCapabilities is required")
    return _fail(*errors) if errors else _ok()


def validate_state_snapshot(msg: dict[str, Any]) -> ValidationResult:
    errors: list[str] = []
    if not msg.get("timestamp"):
        errors.append("timestamp is required")
    return _fail(*errors) if errors else _ok()


def validate_agent_frame(msg: dict[str, Any]) -> ValidationResult:
    errors: list[str] = []
    if not msg.get("id"):
        errors.append("id is required")
    if not msg.get("frameType"):
        errors.append("frameType is required")

    frame_type = msg.get("frameType", "")

    if frame_type == "state_delta":
        metadata = msg.get("metadata", {})
        if metadata.get("revertible") and not metadata.get("revertOperations"):
            errors.append("revertible state_delta MUST include revertOperations")

    known_types = {
        "text", "tool_card", "confirmation", "progress", "state_delta",
        "toast", "artifact", "component", "error", "end",
    }

    if frame_type not in known_types and not frame_type.startswith("x-"):
        if not msg.get("fallbackText"):
            errors.append(f"Unknown frameType '{frame_type}' without fallbackText")

    return _fail(*errors) if errors else _ok()


def validate_user_signal(msg: dict[str, Any]) -> ValidationResult:
    errors: list[str] = []
    signal_type = msg.get("signalType")
    if not signal_type:
        errors.append("signalType is required")

    known_signals = {
        "message", "confirm", "deny", "interrupt", "redirect",
        "context_change", "feedback", "session_switch",
    }

    if signal_type and signal_type not in known_signals:
        errors.append(f"Unknown signalType: {signal_type}")

    return _fail(*errors) if errors else _ok()


def validate_presence_update(msg: dict[str, Any]) -> ValidationResult:
    errors: list[str] = []
    if not msg.get("state"):
        errors.append("state is required")
    confidence = msg.get("confidence")
    if confidence is not None and (confidence < 0 or confidence > 1):
        errors.append("confidence must be between 0 and 1")
    return _fail(*errors) if errors else _ok()


def validate_agent_card(card: dict[str, Any]) -> ValidationResult:
    errors: list[str] = []
    if not card.get("h2a"):
        errors.append("h2a version is required")
    if not card.get("name"):
        errors.append("name is required")
    if not card.get("capabilities"):
        errors.append("capabilities is required")
    caps = card.get("capabilities", {})
    if not isinstance(caps.get("streaming"), bool):
        errors.append("capabilities.streaming is required and must be bool")
    if not card.get("endpoint", {}).get("h2a"):
        errors.append("endpoint.h2a is required")
    return _fail(*errors) if errors else _ok()

# H2A Conformance Levels — v0.1

Uses RFC 2119 keywords: MUST, MUST NOT, SHOULD, SHOULD NOT, MAY.

---

## Overview

H2A defines three conformance levels. Each builds on the previous.
Implementations declare their level in the AgentCard and session handshake.

```
H2A Full     = Standard + Orchestration + Accessibility + Privacy + Audit
H2A Standard = Basic + Presence + StateSync + ToolCards + Confirmations
H2A Basic    = Text streaming + UserSignals + Session management
```

---

## Level 1: H2A Basic

**Purpose:** Minimum viable agent-frontend integration. A streaming chatbot.

### Host Requirements (Basic)

| ID | Requirement | Keyword |
|----|------------|---------|
| HB-1 | Parse and render `agent.frame` with `frameType: "text"` | MUST |
| HB-2 | Send `user.signal` with `signalType: "message"` | MUST |
| HB-3 | Send `user.signal` with `signalType: "interrupt"` | MUST |
| HB-4 | Implement `session.open` and `session.resume` | MUST |
| HB-5 | Handle `agent.frame` with `frameType: "error"` | MUST |
| HB-6 | Handle `agent.frame` with `frameType: "end"` | MUST |
| HB-7 | Support at least one transport (SSE+HTTP recommended) | MUST |
| HB-8 | Render `fallbackText` for unknown frame types | MUST |
| HB-9 | Sanitize all rendered text content per Security Addendum S1.1 | MUST |
| HB-10 | Implement client-side frame count limits per Security Addendum S3 | MUST |

### Agent Requirements (Basic)

| ID | Requirement | Keyword |
|----|------------|---------|
| AB-1 | Serve AgentCard at `/.well-known/h2a-agent.json` | MUST |
| AB-2 | Accept `session.open` and respond with `session.ack` | MUST |
| AB-3 | Generate session IDs server-side (min 128-bit entropy) | MUST |
| AB-4 | Send `agent.frame` with `frameType: "text"` | MUST |
| AB-5 | Send `agent.frame` with `frameType: "end"` after each response | MUST |
| AB-6 | Handle `user.signal` with `signalType: "interrupt"` | MUST |
| AB-7 | Include `fallbackText` for non-text frame types | MUST |
| AB-8 | Enforce rate limits on incoming signals | MUST |
| AB-9 | Support session resume with `lastReceivedSequence` | SHOULD |
| AB-10 | Send keepalive comments during idle SSE connections | SHOULD |

---

## Level 2: H2A Standard

**Purpose:** Rich agent interaction with presence, context awareness, and structured UI.

Includes all Basic requirements plus:

### Host Requirements (Standard)

| ID | Requirement | Keyword |
|----|------------|---------|
| HS-1 | Send `state.snapshot` on session open and page navigation | MUST |
| HS-2 | Send `state.diff` for incremental state changes | SHOULD |
| HS-3 | Render `presence.update` with visual indicator | MUST |
| HS-4 | Render `frameType: "tool_card"` | MUST |
| HS-5 | Render `frameType: "confirmation"` with actionable options | MUST |
| HS-6 | Render `frameType: "progress"` with progress indicator | MUST |
| HS-7 | Render `frameType: "toast"` as non-blocking notification | MUST |
| HS-8 | Send `user.signal` with `signalType: "confirm"` and `"deny"` | MUST |
| HS-9 | Send `user.signal` with `signalType: "context_change"` | MUST |
| HS-10 | Throttle StateSnapshot sending to max 1/second | MUST |
| HS-11 | Apply `stateRequirements.projections` to reduce snapshot size | SHOULD |
| HS-12 | Declare `hostCapabilities` in `session.open` | MUST |
| HS-13 | Respect `reducedMotion` accessibility preference | MUST |
| HS-14 | Announce presence changes via ARIA live regions | MUST |

### Agent Requirements (Standard)

| ID | Requirement | Keyword |
|----|------------|---------|
| AS-1 | Declare `presence.states` in AgentCard | MUST |
| AS-2 | Send `presence.update` on state transitions | MUST |
| AS-3 | Process `state.snapshot` and `state.diff` messages | MUST |
| AS-4 | Declare `stateRequirements` in AgentCard | MUST |
| AS-5 | Validate StateSnapshot data types and truncate long values | MUST |
| AS-6 | Support `frameType: "tool_card"` with `fallbackText` | MUST |
| AS-7 | Support `frameType: "confirmation"` with timeout | SHOULD |
| AS-8 | Negotiate capabilities in `session.ack` | MUST |
| AS-9 | Only send frame types the Host declared it can render | MUST |
| AS-10 | Treat StateSnapshot data as untrusted input | MUST |

---

## Level 3: H2A Full

**Purpose:** Production-grade with orchestration, security hardening, and compliance.

Includes all Standard requirements plus:

### Host Requirements (Full)

| ID | Requirement | Keyword |
|----|------------|---------|
| HF-1 | Enforce `orchestrationPolicy` on all `state_delta` frames | MUST |
| HF-2 | Validate `state_delta` targets against binding layer (not DOM) | MUST |
| HF-3 | Implement action tiers (autonomous/confirmable/restricted) | MUST |
| HF-4 | Automatically confirm `autonomous` tier operations | MUST |
| HF-5 | Prompt user for `confirmable` tier operations | MUST |
| HF-6 | Require explicit approval for `restricted` tier operations | MUST |
| HF-7 | Support `state_delta` revert via `revertOperations` | MUST |
| HF-8 | Produce structured audit log entries per Security Addendum S6 | MUST |
| HF-9 | Implement keyboard focus management for confirmation frames | MUST |
| HF-10 | Provide text alternatives for all visual presence indicators | MUST |
| HF-11 | Make all frame content accessible via keyboard navigation | MUST |
| HF-12 | Implement frame rendering with proper ARIA roles per main spec §9.3 | MUST |
| HF-13 | Enforce path-level navigation restrictions per Security Addendum S1.3 | MUST |
| HF-14 | Support `orchestrationPolicy.rateLimits` client-side | MUST |
| HF-15 | Render `frameType: "artifact"` (file download/preview) | MUST |
| HF-16 | Implement GDPR data export/deletion endpoints (if applicable) | MUST* |

*MUST if operating in GDPR jurisdictions, SHOULD otherwise.

### Agent Requirements (Full)

| ID | Requirement | Keyword |
|----|------------|---------|
| AF-1 | Support `frameType: "state_delta"` with operation list | MUST |
| AF-2 | Include `revertOperations` for all revertible state_deltas | MUST |
| AF-3 | Include `narration` for all state_delta frames | MUST |
| AF-4 | Respect `orchestrationPolicy` limits from Host | MUST |
| AF-5 | Stop all operations on `interrupt` signal within 1 second | MUST |
| AF-6 | Classify actions into tiers and declare tier in confirmation frames | MUST |
| AF-7 | Implement `GET /h2a/data-export/{userId}` | MUST* |
| AF-8 | Implement `DELETE /h2a/data/{userId}` | MUST* |
| AF-9 | Implement `GET /h2a/health` with status check | MUST |
| AF-10 | Support `frameType: "artifact"` with MIME type | MUST |
| AF-11 | Not exceed frame/byte limits per Security Addendum S3 | MUST |
| AF-12 | Include `timing` metadata in frames for latency monitoring | SHOULD |

*MUST if serving users in GDPR jurisdictions, SHOULD otherwise.

---

## Declaring Conformance

In AgentCard:
```json
{
  "h2a": "0.1",
  "conformance": "standard",
  ...
}
```

In session handshake:
```json
{
  "type": "session.open",
  "hostCapabilities": {
    "conformanceLevel": "full"
  }
}

{
  "type": "session.ack",
  "negotiatedCapabilities": {
    "conformanceLevel": "standard"
  }
}
```

The negotiated level is the MINIMUM of Host and Agent declared levels.

---

## Conformance Testing

A conformance test suite (planned: `@h2a/test-suite`) will validate:

1. **Message shape compliance** — Are all required fields present and typed correctly?
2. **Behavioral compliance** — Does the implementation handle error cases correctly?
3. **Security compliance** — Does the implementation enforce sanitization and limits?
4. **Accessibility compliance** (Full only) — Does the implementation pass automated a11y checks?

Implementations that pass the test suite MAY declare themselves "H2A [Level] Conformant."

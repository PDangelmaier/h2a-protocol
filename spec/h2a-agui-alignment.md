# H2A ↔ AG-UI Alignment Document

**Version:** 1.0
**Date:** 2026-04-24
**Author:** Philipp Dangelmaier (The1ne)
**Purpose:** 1:1 event type mapping, gap analysis, H2A differentiators

---

## 1. Event Type Mapping

### AG-UI Events → H2A Equivalents

| # | AG-UI Event | H2A Equivalent | Notes |
|---|------------|---------------|-------|
| 1 | `TEXT_MESSAGE_START` | `agent.frame` (frameType: `text`, streaming: true) | H2A uses single frame type with streaming flag |
| 2 | `TEXT_MESSAGE_CONTENT` | `agent.frame` (frameType: `text`, streaming: true) | Continued text chunk |
| 3 | `TEXT_MESSAGE_END` | `agent.frame` (frameType: `text`, final: true) | `final` flag signals completion |
| 4 | `TOOL_CALL_START` | `agent.frame` (frameType: `tool_card`, status: `running`) | H2A combines start/args/end into status field |
| 5 | `TOOL_CALL_ARGS` | `agent.frame` (frameType: `tool_card`, status: `running`) | Args in content.input |
| 6 | `TOOL_CALL_END` | `agent.frame` (frameType: `tool_card`, status: `completed`) | Status change signals end |
| 7 | `STATE_SNAPSHOT` | `state.snapshot` | Semantically identical |
| 8 | `STATE_SNAPSHOT_DELTA` | `state.diff` (JSON Patch RFC 6902) | H2A uses standard JSON Patch, AG-UI uses custom delta |
| 9 | `STEP_STARTED` | `agent.frame` (frameType: `progress`, percent: 0) | H2A adds percent, estimated remaining |
| 10 | `STEP_FINISHED` | `agent.frame` (frameType: `progress`, percent: 100) | Single frame type, status via percent |
| 11 | `RUN_STARTED` | `session.ack` | Session acknowledgment = run started |
| 12 | `RUN_FINISHED` | `agent.frame` (frameType: `end`) | Explicit end frame |
| 13 | `RUN_ERROR` | `agent.frame` (frameType: `error`) | H2A adds error codes, severity, retryAfter |
| 14 | `CUSTOM` | `agent.frame` (frameType: `component`) | H2A typed as `component` for custom UI |
| 15 | `RAW` | No direct equivalent | H2A does not allow raw/untyped data |
| 16 | `LIFECYCLE` | `presence.update` | H2A's presence system is richer (4 states + transitions) |

### H2A Frame Types Without AG-UI Equivalent

| H2A Frame Type | Purpose | AG-UI Gap |
|---------------|---------|-----------|
| `confirmation` | Human-in-the-loop approval with tiered actions | **No equivalent.** AG-UI has no consent/approval mechanism |
| `toast` | Non-blocking notifications with severity | **No equivalent.** Must use CUSTOM event |
| `artifact` | Structured file/output delivery | **No equivalent.** Must use CUSTOM event |
| `state_delta` | Agent-driven UI manipulation (orchestration) | **No equivalent.** AG-UI has no orchestration model |

---

## 2. Architectural Differences

### 2.1 Transport

| Aspect | AG-UI | H2A |
|--------|-------|-----|
| Primary | SSE (Server-Sent Events) | SSE + HTTP POST |
| Session Model | Implicit (via SSE connection) | Explicit (session.open/ack/resume) |
| Reconnection | Not specified | Specified with lastReceivedSequence |
| Alternative | Not specified | WebSocket specified as optional |
| Capability Negotiation | None | Full negotiation on session open |

**H2A Advantage:** Explicit session lifecycle with capability negotiation means host and agent agree on what's supported before any data flows. AG-UI assumes both sides support everything.

### 2.2 State Management

| Aspect | AG-UI | H2A |
|--------|-------|-----|
| State Format | Custom delta format | JSON Patch (RFC 6902) |
| State Direction | Agent → Host only | Bidirectional (snapshot + diff) |
| UI Manipulation | Not supported | `state_delta` with operation types |
| Sandboxing | None | OrchestrationPolicy (action tiers) |

**H2A Advantage:** JSON Patch is an IETF standard with mature tooling. The OrchestrationPolicy provides host-controlled sandboxing for agent UI actions.

### 2.3 Presence

| Aspect | AG-UI | H2A |
|--------|-------|-----|
| Model | Binary (connected/disconnected via LIFECYCLE) | 4-state machine (rest/attentive/conversing/orchestrating) |
| Transitions | Not specified | Event-driven with valid transition graph |
| Idle Detection | Not specified | Configurable idle timeout with auto-transition |
| Custom States | Not supported | Parent-child extension model |

**H2A Advantage:** The 4-state presence model maps to visual indicators (breathing animations) that communicate agent status to the user. This is a core UX differentiator.

---

## 3. Security Comparison

| Security Feature | AG-UI | H2A |
|-----------------|-------|-----|
| Content Sanitization | Not specified | Normative: HTML sanitization per frame type (§8.3) |
| XSS Prevention | Not addressed | DOMPurify or equivalent REQUIRED (§8.3) |
| SSRF Prevention | Not addressed | State snapshot allowlisting (§8.4) |
| Rate Limiting | Not specified | `maxOperationsPerFrame`, `rateLimitPerMinute` in OrchestrationPolicy |
| Path Traversal | Not addressed | `navigationScope` restricts agent navigation |
| Session Security | Not specified | 128-bit server-generated session IDs, token binding |
| Action Tiers | Not supported | autonomous / confirmable / restricted |
| Audit Logging | Not specified | Audit log schema defined for enterprise compliance |

**H2A Advantage:** AG-UI has zero security specifications. Any production deployment of AG-UI must implement its own security layer. H2A provides security by default.

---

## 4. Accessibility Comparison

| A11y Feature | AG-UI | H2A |
|-------------|-------|-----|
| ARIA Roles | Not specified | Normative mapping per frame type (§9.3) |
| Focus Management | Not addressed | Confirmation frame focus protocol (§9.4) |
| Screen Reader | Not addressed | 500ms debounced streaming text buffer (§9.5) |
| Reduced Motion | Not addressed | `reducedMotion` disables presence animations |
| Cognitive Load | Not addressed | Agent complexity limits per conformance level |
| Voice-Only Mode | Not supported | Specified as first-class transport (v0.3) |
| WCAG Level | Not specified | WCAG 2.2 AA normative requirement |

**H2A Advantage:** AG-UI provides zero accessibility specifications. H2A is designed accessibility-first with normative WCAG 2.2 AA requirements.

---

## 5. Privacy Comparison

| Privacy Feature | AG-UI | H2A |
|----------------|-------|-----|
| Data Minimization | Not specified | StateSnapshot allowlisting + agent projection filters |
| GDPR Endpoints | Not supported | `/h2a/data-export/{userId}`, `/h2a/data/{userId}`, `/h2a/data-policy` |
| Consent Model | Not addressed | Per-capability consent with legal basis |
| Data Retention | Not specified | Retention policies in data-policy endpoint |
| Right to be Forgotten | Not supported | DELETE endpoint specified |

**H2A Advantage:** AG-UI has no privacy framework. H2A provides GDPR-ready endpoints and data minimization architecture.

---

## 6. Summary: Where H2A is Superior

| Area | AG-UI Status | H2A Status | Impact |
|------|-------------|-----------|--------|
| **Security** | None | Comprehensive (§8) | Production-readiness |
| **Accessibility** | None | WCAG 2.2 AA (§9) | Legal compliance, inclusion |
| **Privacy** | None | GDPR-ready (§10) | EU market access |
| **Presence** | Binary lifecycle | 4-state machine | UX quality |
| **Orchestration** | None | Sandboxed UI manipulation | Agent capabilities |
| **Confirmation** | None | Tiered human-in-the-loop | Safety |
| **Session Management** | Implicit | Explicit with resume | Reliability |
| **State Format** | Custom | IETF standard (RFC 6902) | Interoperability |
| **Conformance Testing** | None | 3-level test suite | Quality assurance |
| **Transport Agnosticism** | SSE only | SSE + WS specified | Flexibility |

### Where AG-UI is Ahead

| Area | AG-UI Status | H2A Status | Risk |
|------|-------------|-----------|------|
| **Adoption** | 13k GitHub stars, 15+ integrations | <100 stars, 0 integrations | Critical — mitigated by superior DX |
| **Ecosystem** | LangGraph, CrewAI, Mastra adapters | None yet | High — Sprint 4 delivers adapters |
| **Maturity** | v0.0.52, production use | v0.1 draft | Medium — Sprint 2-3 close gap |

---

## 7. Migration Path: AG-UI → H2A

For projects currently using AG-UI:

1. **Event mapping is 1:1** — every AG-UI event has an H2A equivalent
2. **H2A adds, never removes** — AG-UI functionality is a subset of H2A
3. **Adapter approach** — `@h2a/adapter-agui` can translate AG-UI events to H2A frames
4. **Incremental adoption** — Start with H2A Basic (text streaming), add Standard (presence/state), then Full (orchestration/security)

---

*This document is maintained as part of the H2A v1.0 standardization effort.*

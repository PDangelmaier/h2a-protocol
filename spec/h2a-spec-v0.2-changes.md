# H2A Specification v0.2 — Changes from v0.1

**Date:** 2026-04-24
**Status:** Candidate
**Authors:** Philipp Dangelmaier (The1ne)

---

## RFC 2119 Adoption

This specification uses the key words "MUST", "MUST NOT", "REQUIRED", "SHALL",
"SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL"
as described in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

All normative requirements from v0.1 are retroactively classified using RFC 2119
keywords in the conformance levels document (h2a-conformance-levels.md).

---

## Protocol Reference Updates

| Protocol | v0.1 Reference | v0.2 Reference | Change |
|----------|---------------|----------------|--------|
| MCP | "MCP" (unversioned) | MCP 2025-11-25 (Linux Foundation) | Pinned to stable release |
| A2A | "A2A" (unversioned) | A2A v1.0.0 (Linux Foundation) | Pinned to stable release |
| AG-UI | Not referenced | AG-UI v0.0.52 (CopilotKit, MIT) | Added as comparison baseline |
| JSON Patch | Referenced | RFC 6902 (normative) | Formal reference |
| JSON Schema | Referenced | Draft 2020-12 (normative) | Pinned to draft version |
| SSE | Referenced | W3C Server-Sent Events (normative) | Formal reference |
| TLS | "required" | TLS 1.3 (RFC 8446) REQUIRED | Minimum version specified |

---

## Normative Changes

### §5.1 AgentCard — Added Fields

```typescript
interface AgentCard {
  // ... existing fields ...
  conformance: ConformanceLevel;       // Was optional, now REQUIRED
  version: string;                      // NEW: Spec version (e.g. "0.2")
  endpoint: {
    h2a: string;
    agentCard?: string;
    healthCheck?: string;               // NEW: Health check endpoint
  };
}
```

An agent MUST include the `conformance` field in its AgentCard.
An agent SHOULD expose a health check endpoint at `/.well-known/h2a-health`.

### §5.4 AgentFrame — Sequence Numbers

In v0.1, `sequence` was optional on AgentFrame. In v0.2:

- An agent at Standard or Full conformance level MUST include monotonically
  increasing `sequence` numbers on all frames within a session.
- A host MUST track the highest received sequence number for session resumption.

### §6.1 Transport — Session Lifecycle

Session lifecycle is now REQUIRED for all conformance levels:

1. Host MUST send `session.open` with `hostCapabilities`
2. Agent MUST respond with `session.ack` containing `negotiatedCapabilities`
3. Host SHOULD support `session.resume` with `lastReceivedSequence`

### §7 Presence — Idle Timeout

The idle timeout behavior is now normative:

- An agent at Standard or Full conformance MUST implement idle timeout
- Default idle timeout SHOULD be 30 seconds
- An agent MUST transition to `rest` state when idle timeout fires
- The `confidence` field on idle-triggered transitions SHOULD be 0.5

### §8 Security — Content Sanitization

Content sanitization requirements are elevated to MUST:

- A host MUST sanitize `text` frame content before rendering in HTML contexts
- A host MUST reject `state_delta` operations that target elements outside
  the `navigationScope` defined in the OrchestrationPolicy
- An agent MUST NOT send `state_delta` frames unless `orchestration` was
  negotiated in the session capabilities

### §9 Accessibility — Screen Reader Buffer

- A host rendering streaming text for screen readers MUST buffer updates
  and announce no more frequently than every 500ms
- A host MUST map each frame type to its normative ARIA role (see §9.3)
- A host MUST manage focus to confirmation frames when they arrive

---

## New Sections

### §13.1 AG-UI Alignment

See companion document: `h2a-agui-alignment.md`

H2A is a superset of AG-UI functionality. Every AG-UI event type maps
to an H2A equivalent. H2A adds security, accessibility, privacy, presence,
orchestration, and confirmation that AG-UI does not specify.

### §14 Voice Extension (Deferred)

Voice interaction is explicitly deferred to v0.3. The v0.1 spec sections
on voice are marked as non-normative and SHOULD NOT be implemented.

The v0.3 voice extension will address:
- Binary audio frames (transport TBD: MessagePack / CBOR)
- Speech-to-intent mapping
- Voice-only presence states
- Interruption via voice activity detection

---

## Informative Changes

### Versioning

H2A version numbering follows:
- **0.x** — Draft/Candidate, breaking changes allowed
- **1.0** — Standard, backwards-compatible changes only
- **1.x** — Standard extensions, additive only

### Maturity Level

| Version | Level | Meaning |
|---------|-------|---------|
| 0.1 | Draft | Concept, unstable |
| **0.2** | **Candidate** | **Stable enough for implementation** |
| 1.0 | Standard | 2+ independent implementations, test suite green |

---

*This document lists changes from h2a-spec-v0.1.md. Both documents together
constitute the H2A v0.2 specification.*

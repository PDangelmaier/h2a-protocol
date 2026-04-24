# H2A Security Addendum — v0.1

Supplements Section 8 of the main spec with concrete mitigations.
Uses RFC 2119 keywords: MUST, MUST NOT, SHOULD, SHOULD NOT, MAY.

---

## S1. Content Sanitization (Mandatory)

### S1.1 Text Frames

When `frameType` is `text` and `format` is `markdown` or `html`:

- Hosts MUST sanitize content before rendering
- Hosts MUST strip: `<script>`, `<iframe>`, `<embed>`, `<object>`, `<form>`,
  `on*` event handlers, `javascript:` URIs, `data:` URIs (except images)
- Hosts SHOULD use an allowlist approach (render known-safe tags only),
  NOT a denylist approach (strip known-bad tags)
- Hosts MUST NOT render raw HTML from `format: "html"` without sanitization

Recommended allowlist:
```
p, br, strong, em, code, pre, ul, ol, li, a[href], img[src,alt],
h1, h2, h3, h4, h5, h6, blockquote, table, thead, tbody, tr, th, td
```

### S1.2 State Delta Targets

`state_delta` operation targets MUST NOT:
- Contain CSS selectors (no `.class`, `#id`, `[attr]` syntax)
- Reference DOM elements directly
- Execute arbitrary code

Targets are abstract identifiers (e.g., `"title"`, `"genre"`, `"submit-button"`)
mapped to actual elements by the Host SDK's binding layer.

### S1.3 Navigation Restrictions

`state_delta` operations with `"op": "navigate"`:

- MUST be restricted to same-origin by default
- MUST NOT navigate to URLs matching: `/admin*`, `/debug*`, `/internal*`,
  `/api/*` unless explicitly allowlisted
- MUST be validated against a path allowlist, not just origin check
- Hosts SHOULD log all navigation operations regardless of policy

```json
{
  "orchestrationPolicy": {
    "navigationScope": "same-origin",
    "navigationPathDenylist": ["/admin", "/debug", "/internal", "/api"],
    "navigationPathAllowlist": ["/projects/*", "/tasks/*", "/settings"]
  }
}
```

---

## S2. Session Security

### S2.1 Session ID Generation

- Session IDs MUST be generated server-side (Agent-side)
- Session IDs MUST be cryptographically random (minimum 128 bits of entropy)
- Hosts MUST NOT propose session IDs — the `sessionId` in `session.open` is a
  request; the Agent's `session.ack` contains the authoritative session ID
- Sessions MUST be bound to an authenticated identity (user ID, API key)

```json
// Host requests
{ "type": "session.open", "requestedSessionId": null }

// Agent responds with server-generated ID
{ "type": "session.ack", "sessionId": "ses_a8f3e7c9b2d14..." }
```

### S2.2 Token Security

- Bearer tokens MUST be transmitted only over TLS 1.2+
- Tokens MUST have an expiry (maximum 24 hours recommended)
- Refresh tokens SHOULD be supported for long-lived sessions
- Tokens MUST be rotated after session resume

### S2.3 Rate Limiting

Agents MUST enforce rate limits on incoming signals:

| Signal Type | Default Limit | Window |
|-------------|--------------|--------|
| `message` | 30 | per minute |
| `context_change` | 60 | per minute |
| `interrupt` | 10 | per minute |
| `confirm` / `deny` | 30 | per minute |
| State snapshots | 60 | per minute |

Exceeding limits returns error frame with code `RATE_LIMITED`.

---

## S3. Frame Limits

### S3.1 Per-Response Limits

- Maximum frames per agent response: 500
- Maximum total bytes per response (all frames): 5 MB
- Maximum `state_delta` operations per frame: 20
- Maximum `state_delta` frames per response: 10

### S3.2 Streaming Limits

- Maximum streaming duration per response: 300 seconds (5 minutes)
- Hosts MUST implement a client-side frame counter and reject frames
  beyond the configured limit
- Hosts MUST implement a client-side byte counter and close the SSE
  connection if the byte limit is exceeded

---

## S4. Content Security Policy Integration

Hosts operating in browsers SHOULD set CSP headers compatible with H2A:

```
Content-Security-Policy:
  default-src 'self';
  connect-src 'self' https://agent-endpoint.example.com;
  img-src 'self' data:;
  style-src 'self' 'unsafe-inline';
  script-src 'self';
```

`state_delta` navigation operations MUST respect CSP `navigate-to` directives.

---

## S5. Prompt Injection Mitigation

### S5.1 StateSnapshot as Untrusted Input

StateSnapshot data MUST be treated as untrusted user input by the Agent.

Agents MUST:
- Validate data types (string where string expected, number where number expected)
- Truncate excessively long field values (recommended: 1000 chars per field)
- Not pass raw StateSnapshot data directly into LLM prompts without sanitization
- Detect and flag content that appears to contain instruction injection attempts

### S5.2 AgentFrame as Untrusted Output

AgentFrame content MUST be treated as untrusted output by the Host.

Hosts MUST:
- Sanitize all rendered text content (see S1.1)
- Validate `state_delta` operations against the orchestration policy
- Reject frames with unknown or unexpected `frameType` values
- Log and alert on frames that fail validation

---

## S6. Audit Log Schema

When `orchestrationPolicy.auditLog` is `true`, the Host MUST produce
structured audit entries:

```json
{
  "timestamp": "2026-04-20T10:30:00.123Z",
  "sessionId": "ses_abc123",
  "userId": "usr_def456",
  "agentName": "Atlas",
  "event": "state_delta_executed",
  "frameId": "frm_001",
  "operations": [
    { "op": "navigate", "target": "/tasks/new", "result": "success" },
    { "op": "fill", "target": "title", "value": "[REDACTED]", "result": "success" }
  ],
  "policy": {
    "tier": "confirmable",
    "userConsent": true,
    "consentFrameId": "frm_000"
  },
  "integrity": "sha256:abc123..."
}
```

Requirements:
- Audit entries MUST be append-only
- Audit entries MUST include integrity hash (SHA-256 chain or HMAC)
- Sensitive values in operations SHOULD be redacted in logs
- Audit log retention MUST comply with applicable data protection regulations
- Audit entries MUST be queryable by sessionId, userId, and time range

---

## S7. Threat Matrix Summary

| # | Threat | Attack | Mitigation | Section |
|---|--------|--------|------------|---------|
| T1 | XSS | Malicious HTML in text frame | Content sanitization allowlist | S1.1 |
| T2 | SSRF | Navigate to internal routes | Path denylist + allowlist | S1.3 |
| T3 | Session fixation | Client-chosen session ID | Server-generated IDs only | S2.1 |
| T4 | Replay | Replayed state_delta frames | Sequence numbers + TLS | S2.2 |
| T5 | DoS (client) | Frame flood | Frame count + byte limits | S3 |
| T6 | DoS (server) | Signal flood | Rate limiting per signal type | S2.3 |
| T7 | Prompt injection | Poisoned StateSnapshot | Input sanitization + truncation | S5.1 |
| T8 | Data exfil | Overshared StateSnapshot | Projections + excludes | Main spec §10 |
| T9 | Privilege escalation | Agent acts beyond policy | OrchestrationPolicy enforcement | Main spec §8.2 |
| T10 | Wallet drain | LLM cost amplification | Response length limits + rate limits | S3 |

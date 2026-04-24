# Open Challenges — Honest Self-Assessment

## Issues That Weren't Addressed Yet (With Proposed Solutions)

### Challenge 1: Multi-Turn Tool Orchestration

**Problem:** A `state_delta` with 5 operations — what if operation 3 fails?
Does the agent retry? Roll back 1-2? Continue with 4-5?

**Raised by:** Reliability Engineer

**Current gap:** The spec defines `revertOperations` but no partial failure model.

**Proposed solution:** Transactional semantics for state_delta:

```json
{
  "frameType": "state_delta",
  "content": {
    "mode": "atomic",
    "operations": [...],
    "onFailure": "rollback"
  }
}
```

Modes:
- `atomic` — all succeed or all roll back
- `sequential` — stop at first failure, keep completed
- `best_effort` — continue despite failures, report at end

The Host reports results per operation:
```json
{
  "type": "user.signal",
  "signalType": "orchestration_result",
  "content": {
    "frameId": "frm_xyz",
    "results": [
      { "op": 0, "status": "success" },
      { "op": 1, "status": "success" },
      { "op": 2, "status": "failed", "error": "Element not found" }
    ]
  }
}
```

---

### Challenge 2: Agent Memory Across Sessions

**Problem:** The spec says sessions can resume, but what about long-term memory?
An agent that forgets everything between sessions is useless for personalization.

**Raised by:** Product Manager

**Current gap:** Session persistence is defined but cross-session memory is not.

**Proposed solution:** Out of scope for H2A v0.1 — intentionally.
Memory is an agent-internal concern, not a protocol concern.
The agent backend decides how to store and recall user preferences.

H2A's contribution: `session.open` includes optional `userProfile` hints:
```json
{
  "type": "session.open",
  "userProfile": {
    "returningUser": true,
    "previousSessionCount": 12,
    "preferences": {
      "verbosity": "concise",
      "language": "de"
    }
  }
}
```

The agent uses this, but H2A doesn't prescribe HOW memory works.

---

### Challenge 3: Real-Time Collaboration (Multiple Humans)

**Problem:** What if multiple humans interact with the same agent?
Team workspace, pair programming with AI, classroom settings.

**Raised by:** Collaboration Product Manager

**Current gap:** H2A defines single-human sessions only.

**Proposed solution for v0.2:**

```json
{
  "type": "session.open",
  "mode": "collaborative",
  "participants": [
    { "id": "user_1", "role": "driver", "name": "Alice" },
    { "id": "user_2", "role": "observer", "name": "Bob" }
  ]
}
```

Roles:
- `driver` — can send all signal types
- `observer` — can send messages but not orchestration commands
- `moderator` — can interrupt and override

Each AgentFrame includes `visibleTo` to control who sees what.

**Note:** This is explicitly v0.2. Getting single-human right first is critical.

---

### Challenge 4: Streaming Latency Measurement

**Problem:** How does a Host know if the agent is slow? How does the agent
know if the Host is processing frames slowly?

**Raised by:** SRE / Performance Engineer

**Current gap:** No latency primitives.

**Proposed solution:** Optional heartbeat / timing metadata:

```json
{
  "type": "agent.frame",
  "frameType": "text",
  "content": "...",
  "timing": {
    "generatedAt": "2026-04-20T10:30:00.123Z",
    "firstTokenAt": "2026-04-20T10:30:00.456Z"
  }
}
```

Host can measure: `receivedAt - generatedAt = transport latency`
Agent can measure via keepalive ACKs.

---

### Challenge 5: Agent-Initiated Sessions

**Problem:** What if the agent wants to reach out to the human proactively?
Push notifications, email, Slack message.

**Raised by:** Growth Product Manager

**Current gap:** H2A assumes the Host initiates sessions.

**Proposed solution:** `agent.push` message type:

```json
{
  "type": "agent.push",
  "channel": "notification",
  "priority": "normal",
  "content": {
    "title": "Episode 3 ist bereit zum Review",
    "body": "Die Qualitaetspruefung ist abgeschlossen.",
    "action": {
      "label": "Jetzt ansehen",
      "deeplink": "/series/noir-hamburg/episodes/3"
    }
  }
}
```

Requires separate push subscription (WebPush, APNs, FCM).
H2A defines the message shape, not the push transport.

---

### Challenge 6: Versioned State Contracts

**Problem:** Agent expects `data.wordCount` but the app renames it to `data.words`.
Suddenly the agent is blind.

**Raised by:** API Versioning Expert

**Current gap:** StateSnapshot schema is freeform.

**Proposed solution:** Optional typed state contracts:

```json
// In AgentCard
{
  "stateRequirements": {
    "schema": "https://myapp.com/h2a-state-schema/v2.json",
    "version": "2.0"
  }
}

// In session.open
{
  "hostCapabilities": {
    "stateSchemaVersion": "2.0"
  }
}
```

If versions mismatch, the agent can request an adapter or degrade gracefully.
This is similar to API versioning — solved problem, just need to apply it.

---

### Challenge 7: Legal Liability for Agent Actions

**Problem:** If an H2A agent fills a form and submits a purchase,
who is legally responsible? The agent developer? The Host developer? The user?

**Raised by:** Legal Counsel

**Current gap:** Technical spec, not legal framework.

**Proposed solution:** H2A includes a non-normative legal guidance appendix:

1. **Action tiers as evidence** — `restricted` tier actions require explicit confirmation,
   providing audit trail for consent
2. **Audit logging** — `orchestrationPolicy.auditLog` creates tamper-evident records
3. **Revert capability** — `revertible: true` reduces liability by enabling undo
4. **Confirmation frames are consent records** — each `confirm` signal is timestamped,
   logged, and attributable to a human

H2A does NOT define legal liability. It provides the TECHNICAL MECHANISMS
that legal frameworks can build on (audit trails, consent records, action tiers).

---

### Challenge 8: Standardization Body

**Problem:** Who owns H2A? A solo developer publishing a spec on GitHub
is not a standard. It's a blog post with JSON schemas.

**Raised by:** Industry Analyst

**Current gap:** No governance structure.

**Proposed solution — staged approach:**

1. **v0.1 (now):** GitHub repo, open issues, MIT license. One author.
2. **v0.2 (3 months):** Invite co-authors from 3+ organizations.
   Form a working group (informal, like early MCP).
3. **v0.3 (6 months):** Move to a neutral foundation (OpenJS, Linux Foundation AI,
   or a new H2A Foundation). Formal governance.
4. **v1.0 (12 months):** RFC-style process. Multiple implementations required
   for each feature to reach "standard" status.

The key insight: MCP started as one company's spec (Anthropic).
A2A started as one company's spec (Google). Both gained legitimacy through
adoption, not through a standards body. H2A follows the same path.

---

### Challenge 9: Testing Without a Real LLM

**Problem:** How do developers test H2A integrations without burning API credits?

**Raised by:** Developer Advocate

**Proposed solution:** H2A Mock Agent:

```bash
npx @h2a/mock-agent --port 8100 --scenario "attentive-then-orchestrate"
```

Ships with standard scenarios:
- `echo` — mirrors user messages back
- `slow-stream` — simulates slow token streaming
- `attentive-then-orchestrate` — observes, suggests, then orchestrates
- `error-handling` — sends various error frames
- `custom` — define your own scenario file

The mock agent implements the full H2A protocol with deterministic behavior.
No LLM needed. Perfect for CI/CD.

---

### Challenge 10: The "Too Late" Argument

**Problem:** "The ecosystem already chose. CopilotKit and Vercel won.
You're too late."

**Raised by:** Venture Capitalist / Realist

**Response:**
- CopilotKit: ~15k GitHub stars, 1 framework (React), no protocol spec
- Vercel AI SDK: Framework-specific, provider-coupled
- Neither has: security model, accessibility spec, privacy framework,
  presence system, transport agnosticism

**The market hasn't chosen a PROTOCOL. It's chosen LIBRARIES.**
Libraries compete on features. Protocols win on interoperability.
HTTP didn't win because it was first. It won because it was open and composable.

The timing is actually perfect:
- Developers are FRUSTRATED with switching costs between agent UI libraries
- Enterprise is BLOCKED by lack of security/accessibility standards
- The agent ecosystem is FRAGMENTING exactly when it needs to converge

H2A arrives at the moment of maximum pain. That's the right time for a protocol.

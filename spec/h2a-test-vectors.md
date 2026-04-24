# H2A Test Vectors — v0.1

Normative message exchanges that conformant implementations MUST handle correctly.

---

## TV-1: Minimal Session (Basic Level)

The simplest possible H2A interaction: open session, send message, receive text, end.

### Host → Agent: Discover

```
GET /.well-known/h2a-agent.json HTTP/1.1
Host: agent.example.com
```

### Agent → Host: AgentCard

```json
{
  "h2a": "0.1",
  "name": "Echo",
  "capabilities": { "streaming": true },
  "conformance": "basic",
  "endpoint": { "h2a": "https://agent.example.com/h2a" }
}
```

### Host → Agent: Open Session

```
POST /h2a/session HTTP/1.1
Content-Type: application/json

{
  "type": "session.open",
  "hostCapabilities": {
    "rendering": ["text"],
    "conformanceLevel": "basic"
  },
  "locale": "en-US"
}
```

### Agent → Host: SSE Stream

```
event: session.ack
data: {"type":"session.ack","sessionId":"ses_7f3a9b2c","negotiatedCapabilities":{"frameTypes":["text","error","end"],"conformanceLevel":"basic"}}

```

### Host → Agent: User Message

```
POST /h2a/signal HTTP/1.1
Content-Type: application/json
X-H2A-Session: ses_7f3a9b2c

{
  "type": "user.signal",
  "signalType": "message",
  "content": "Hello"
}
```

### Agent → Host: Streamed Response

```
event: agent.frame
id: frm_001
data: {"type":"agent.frame","id":"frm_001","sequence":1,"frameType":"text","content":"Hello! ","streaming":true,"final":false}

event: agent.frame
id: frm_002
data: {"type":"agent.frame","id":"frm_002","sequence":2,"frameType":"text","content":"How can I help?","streaming":true,"final":true}

event: agent.frame
id: frm_003
data: {"type":"agent.frame","id":"frm_003","sequence":3,"frameType":"end","content":{"reason":"complete"}}

```

### Expected Host Behavior

- MUST render "Hello! How can I help?" to the user
- MUST handle the `end` frame by re-enabling user input

---

## TV-2: Interrupt Mid-Stream (Basic Level)

User interrupts the agent while it's streaming.

### Agent streaming:

```
event: agent.frame
id: frm_010
data: {"type":"agent.frame","id":"frm_010","sequence":10,"frameType":"text","content":"Let me explain the ","streaming":true,"final":false,"metadata":{"interruptible":true}}

```

### Host sends interrupt:

```
POST /h2a/signal HTTP/1.1
Content-Type: application/json
X-H2A-Session: ses_7f3a9b2c

{
  "type": "user.signal",
  "signalType": "interrupt",
  "content": { "scope": "current" }
}
```

### Agent MUST respond:

```
event: agent.frame
id: frm_011
data: {"type":"agent.frame","id":"frm_011","sequence":11,"frameType":"end","content":{"reason":"interrupted"}}

```

### Expected Behavior

- Agent MUST stop generating within 1 second of receiving interrupt
- Agent MUST send `end` frame with `reason: "interrupted"`
- Host MUST re-enable user input after receiving the end frame

---

## TV-3: Presence + State Sync (Standard Level)

Host sends state, agent transitions to attentive.

### Host → Agent: State Snapshot

```
POST /h2a/signal HTTP/1.1
Content-Type: application/json
X-H2A-Session: ses_7f3a9b2c

{
  "type": "state.snapshot",
  "timestamp": "2026-04-20T10:30:00Z",
  "page": { "route": "/projects/1/board", "title": "Sprint Board", "section": "task-board" },
  "data": { "projectId": "proj_1", "overdueCount": 3 },
  "user": { "activity": "idle", "idleSeconds": 65 }
}
```

### Agent → Host: Presence + Toast

```
event: presence.update
id: prs_001
data: {"type":"presence.update","state":"attentive","confidence":0.8,"trigger":"3 overdue tasks detected"}

event: agent.frame
id: frm_020
data: {"type":"agent.frame","id":"frm_020","sequence":20,"frameType":"toast","content":{"message":"3 tasks are overdue. Want me to help prioritize?","severity":"warning","duration":0,"action":{"label":"Yes, help me","signalType":"message"}},"fallbackText":"Warning: 3 tasks are overdue."}

```

### Expected Host Behavior

- MUST update visual presence indicator to "attentive"
- MUST render toast notification with action button
- MUST announce via ARIA: "Warning: 3 tasks are overdue."
- When user clicks action → MUST send `user.signal` with `signalType: "message"`

---

## TV-4: Confirmation Flow (Standard Level)

Agent requests confirmation before acting.

### Agent → Host:

```
event: presence.update
id: prs_002
data: {"type":"presence.update","state":"conversing","confidence":1.0}

event: agent.frame
id: frm_030
data: {"type":"agent.frame","id":"frm_030","sequence":30,"frameType":"confirmation","content":{"action":"archive_project","description":"Archive project 'Alpha' and all 47 tasks? This can be undone within 30 days.","tier":"confirmable","options":[{"id":"confirm","label":"Archive","default":false,"destructive":true},{"id":"deny","label":"Cancel","default":true}],"timeout":60},"fallbackText":"Confirm: Archive project Alpha with 47 tasks?"}

```

### Host → Agent: User Confirms

```json
{
  "type": "user.signal",
  "signalType": "confirm",
  "content": { "frameId": "frm_030", "choice": "confirm" }
}
```

### Host → Agent: User Denies (Alternative)

```json
{
  "type": "user.signal",
  "signalType": "deny",
  "content": { "frameId": "frm_030", "reason": "Not yet" }
}
```

### Expected Host Behavior

- MUST render confirmation as `alertdialog` (ARIA role)
- MUST move keyboard focus to the confirmation dialog
- MUST auto-deny after `timeout` seconds if no response
- Destructive options MUST be visually distinct (e.g., red)
- Default option MUST be focusable via Enter key

---

## TV-5: UI Orchestration (Full Level)

Agent manipulates UI on user's behalf.

### Agent → Host:

```
event: presence.update
id: prs_003
data: {"type":"presence.update","state":"orchestrating","confidence":1.0,"trigger":"User requested task creation"}

event: agent.frame
id: frm_040
data: {"type":"agent.frame","id":"frm_040","sequence":40,"frameType":"state_delta","content":{"mode":"sequential","operations":[{"op":"navigate","target":"/tasks/new"},{"op":"fill","target":"title","value":"Prepare sprint review presentation"},{"op":"fill","target":"priority","value":"high"},{"op":"fill","target":"assignee","value":"current_user"}]},"metadata":{"interruptible":true,"revertible":true,"revertOperations":[{"op":"navigate","target":"/projects/1/board"}],"narration":"Creating a new high-priority task..."}}

event: agent.frame
id: frm_041
data: {"type":"agent.frame","id":"frm_041","sequence":41,"frameType":"end","content":{"reason":"complete"}}

event: presence.update
id: prs_004
data: {"type":"presence.update","state":"rest","confidence":1.0}

```

### Expected Host Behavior

- MUST validate each operation against `orchestrationPolicy`
- MUST reject operations not in `allowedOperations`
- MUST reject navigation to paths in `navigationPathDenylist`
- MUST map abstract targets ("title", "priority") to actual UI elements via binding layer
- MUST execute operations sequentially (sequential mode)
- MUST narrate via ARIA: "Creating a new high-priority task..."
- MUST allow interrupt at any point → execute `revertOperations`
- MUST log all operations to audit log (Full level)

---

## TV-6: Error Recovery (All Levels)

Agent hits rate limit.

### Agent → Host:

```
event: agent.frame
id: frm_err_001
data: {"type":"agent.frame","id":"frm_err_001","frameType":"error","content":{"code":"RATE_LIMITED","message":"Too many requests. Please wait.","retryAfter":30,"severity":"warning"},"fallbackText":"Rate limited. Wait 30 seconds."}

```

### Expected Host Behavior

- MUST display error to user (toast or inline)
- MUST disable signal sending for `retryAfter` seconds
- MUST NOT auto-retry without backoff

---

## TV-7: Unknown Frame Type Fallback (All Levels)

Agent sends a frame type the Host doesn't understand.

### Agent → Host:

```
event: agent.frame
id: frm_050
data: {"type":"agent.frame","id":"frm_050","sequence":50,"frameType":"x-3d-model","content":{"modelUrl":"https://...","format":"gltf"},"fallbackText":"3D model of the project timeline is available at the provided URL."}

```

### Expected Host Behavior

- Host does NOT understand `x-3d-model`
- MUST render `fallbackText` instead: "3D model of the project timeline is available at the provided URL."
- MUST NOT crash, show empty frame, or ignore the frame silently

---

## TV-8: Session Resume After Disconnect (All Levels)

Network drops, Host reconnects.

### Host → Agent:

```
POST /h2a/session HTTP/1.1
Content-Type: application/json

{
  "type": "session.resume",
  "sessionId": "ses_7f3a9b2c",
  "lastReceivedSequence": 42
}
```

### Agent → Host (replays missed):

```
event: session.ack
data: {"type":"session.ack","sessionId":"ses_7f3a9b2c","resumedFromSequence":42}

event: agent.frame
id: frm_043
data: {"type":"agent.frame","id":"frm_043","sequence":43,"frameType":"text","content":"(This was sent while you were disconnected)","final":true}

event: agent.frame
id: frm_044
data: {"type":"agent.frame","id":"frm_044","sequence":44,"frameType":"end","content":{"reason":"complete"}}

```

### Expected Behavior

- Agent MUST replay all frames with sequence > `lastReceivedSequence`
- If replay buffer is exhausted, Agent MUST send `error` with code `STATE_SYNC_ERROR`
- Host MUST deduplicate frames by sequence number

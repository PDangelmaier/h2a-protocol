import type { ConformanceLevel, AgentCard, SessionAck, AgentFrame } from "@h2a/core";
import { validateAgentCard, validateSessionAck, validateAgentFrame } from "@h2a/core";

export interface ConformanceTest {
  id: string;
  name: string;
  level: ConformanceLevel;
  run: (ctx: TestContext) => Promise<void>;
}

export interface TestContext {
  endpoint: string;
  fetch: typeof globalThis.fetch;
  sessionId?: string;
  timeout: number;
}

async function fetchJson<T>(ctx: TestContext, path: string, init?: RequestInit): Promise<T> {
  const res = await ctx.fetch(`${ctx.endpoint}${path}`, {
    signal: AbortSignal.timeout(ctx.timeout),
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(ctx: TestContext, path: string, body: unknown): Promise<Response> {
  return ctx.fetch(`${ctx.endpoint}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ctx.sessionId ? { "X-H2A-Session": ctx.sessionId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ctx.timeout),
  });
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Basic Level Tests ──

export const BASIC_TESTS: ConformanceTest[] = [
  {
    id: "B-01",
    name: "AgentCard served at well-known URL",
    level: "basic",
    async run(ctx) {
      const card = await fetchJson<AgentCard>(ctx, "/.well-known/h2a-agent.json");
      const result = validateAgentCard(card);
      assert(result.valid, `Invalid AgentCard: ${result.errors.join(", ")}`);
      assert(typeof card.h2a === "string", "h2a version must be a string");
      assert(typeof card.name === "string", "name must be a string");
      assert(card.capabilities.streaming === true, "streaming must be true");
    },
  },
  {
    id: "B-02",
    name: "Session open returns server-generated ID",
    level: "basic",
    async run(ctx) {
      const res = await postJson(ctx, "/h2a/session", {
        type: "session.open",
        hostCapabilities: { rendering: ["text"], conformanceLevel: "basic" },
        locale: "en-US",
      });
      assert(res.ok, `Session open failed: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let found = false;

      while (!found) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        if (buffer.includes("\n\n")) {
          const dataMatch = buffer.match(/data: (.+)/);
          if (dataMatch) {
            const ack = JSON.parse(dataMatch[1]) as SessionAck;
            const result = validateSessionAck(ack);
            assert(result.valid, `Invalid session.ack: ${result.errors.join(", ")}`);
            assert(ack.sessionId.length >= 8, "Session ID must be at least 8 chars");
            ctx.sessionId = ack.sessionId;
            found = true;
          }
        }
      }

      reader.cancel();
      assert(found, "No session.ack received");
    },
  },
  {
    id: "B-03",
    name: "Text message produces streamed text frames",
    level: "basic",
    async run(ctx) {
      assert(!!ctx.sessionId, "Session must be established first (run B-02)");

      const res = await postJson(ctx, "/h2a/signal", {
        type: "user.signal",
        signalType: "message",
        content: { text: "Hello" },
      });
      assert(res.ok, `Signal failed: ${res.status}`);
    },
  },
  {
    id: "B-04",
    name: "Interrupt signal is accepted",
    level: "basic",
    async run(ctx) {
      assert(!!ctx.sessionId, "Session must be established first");

      const res = await postJson(ctx, "/h2a/signal", {
        type: "user.signal",
        signalType: "interrupt",
        content: { scope: "current" },
      });
      assert(res.ok, `Interrupt signal failed: ${res.status}`);
    },
  },
  {
    id: "B-05",
    name: "Unknown frame type with fallbackText is accepted",
    level: "basic",
    async run(_ctx) {
      const frame: AgentFrame = {
        type: "agent.frame",
        id: "test_001",
        frameType: "x-unknown-custom",
        content: { custom: true },
        fallbackText: "Custom content available",
      };
      const result = validateAgentFrame(frame);
      assert(result.valid, `Frame validation failed: ${result.errors.join(", ")}`);
    },
  },
  {
    id: "B-06",
    name: "Unknown frame type WITHOUT fallbackText fails validation",
    level: "basic",
    async run(_ctx) {
      const frame: AgentFrame = {
        type: "agent.frame",
        id: "test_002",
        frameType: "totally_unknown",
        content: {},
      };
      const result = validateAgentFrame(frame);
      assert(!result.valid, "Unknown frame without fallbackText must fail validation");
    },
  },
];

// ── Standard Level Tests ──

export const STANDARD_TESTS: ConformanceTest[] = [
  {
    id: "S-01",
    name: "AgentCard declares presence states",
    level: "standard",
    async run(ctx) {
      const card = await fetchJson<AgentCard>(ctx, "/.well-known/h2a-agent.json");
      assert(!!card.presence, "presence must be defined for Standard level");
      assert(Array.isArray(card.presence!.states), "presence.states must be an array");
      assert(card.presence!.states.includes("rest"), "Must support 'rest' state");
    },
  },
  {
    id: "S-02",
    name: "AgentCard declares stateRequirements",
    level: "standard",
    async run(ctx) {
      const card = await fetchJson<AgentCard>(ctx, "/.well-known/h2a-agent.json");
      assert(!!card.stateRequirements, "stateRequirements must be defined for Standard level");
    },
  },
  {
    id: "S-03",
    name: "StateSnapshot signal is accepted",
    level: "standard",
    async run(ctx) {
      assert(!!ctx.sessionId, "Session must be established first");

      const res = await postJson(ctx, "/h2a/signal", {
        type: "user.signal",
        signalType: "context_change",
        content: {
          type: "state.snapshot",
          timestamp: new Date().toISOString(),
          page: { route: "/test", title: "Test Page" },
          data: { testValue: 42 },
          user: { activity: "idle", idleSeconds: 0 },
        },
      });
      assert(res.ok, `StateSnapshot signal failed: ${res.status}`);
    },
  },
  {
    id: "S-04",
    name: "Confirm signal is accepted",
    level: "standard",
    async run(ctx) {
      assert(!!ctx.sessionId, "Session must be established first");

      const res = await postJson(ctx, "/h2a/signal", {
        type: "user.signal",
        signalType: "confirm",
        content: { frameId: "test_frame", choice: "yes" },
      });
      assert(res.ok, `Confirm signal failed: ${res.status}`);
    },
  },
];

// ── Full Level Tests ──

export const STANDARD_VALIDATION_TESTS: ConformanceTest[] = [
  {
    id: "S-05",
    name: "Negotiated capabilities include presence for Standard",
    level: "standard",
    async run(ctx) {
      const res = await postJson(ctx, "/h2a/session", {
        type: "session.open",
        hostCapabilities: {
          rendering: ["text", "tool_card", "progress", "confirmation", "toast", "error", "end"],
          conformanceLevel: "standard",
          stateSync: true,
        },
        locale: "en-US",
      });
      assert(res.ok, `Session open failed: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        if (buffer.includes("\n\n")) {
          const dataMatch = buffer.match(/data: (.+)/);
          if (dataMatch) {
            const ack = JSON.parse(dataMatch[1]) as SessionAck;
            assert(ack.negotiatedCapabilities.conformanceLevel !== undefined,
              "Negotiated capabilities must include conformanceLevel");
            break;
          }
        }
      }

      reader.cancel();
    },
  },
  {
    id: "S-06",
    name: "Deny signal is accepted",
    level: "standard",
    async run(ctx) {
      assert(!!ctx.sessionId, "Session must be established first");

      const res = await postJson(ctx, "/h2a/signal", {
        type: "user.signal",
        signalType: "deny",
        content: { frameId: "test_frame", reason: "User declined" },
      });
      assert(res.ok, `Deny signal failed: ${res.status}`);
    },
  },
  {
    id: "S-07",
    name: "Feedback signal is accepted",
    level: "standard",
    async run(ctx) {
      assert(!!ctx.sessionId, "Session must be established first");

      const res = await postJson(ctx, "/h2a/signal", {
        type: "user.signal",
        signalType: "feedback",
        content: { rating: "positive", comment: "Good response" },
      });
      assert(res.ok, `Feedback signal failed: ${res.status}`);
    },
  },
];

// ── Full Level Tests ──

export const FULL_TESTS: ConformanceTest[] = [
  {
    id: "F-01",
    name: "Health endpoint responds",
    level: "full",
    async run(ctx) {
      const health = await fetchJson<{ status: string }>(ctx, "/h2a/health");
      assert(
        ["healthy", "degraded", "unhealthy", "ok"].includes(health.status),
        `Invalid health status: ${health.status}`,
      );
    },
  },
  {
    id: "F-02",
    name: "Revertible state_delta requires revertOperations",
    level: "full",
    async run(_ctx) {
      const frame: AgentFrame = {
        type: "agent.frame",
        id: "test_sd_001",
        frameType: "state_delta",
        content: {
          operations: [{ op: "fill", target: "title", value: "test" }],
        },
        metadata: {
          interruptible: true,
          revertible: true,
        },
      };
      const result = validateAgentFrame(frame);
      assert(!result.valid, "Revertible state_delta without revertOperations must fail");
      assert(
        result.errors.some((e) => e.includes("revertOperations")),
        "Error must mention revertOperations",
      );
    },
  },
  {
    id: "F-03",
    name: "OrchestrationPolicy denies restricted paths",
    level: "full",
    async run(_ctx) {
      const { validateStateDelta } = await import("@h2a/core");
      const result = validateStateDelta(
        [{ op: "navigate", target: "/admin/users" }],
        {
          allowedOperations: ["navigate", "fill"],
          navigationPathDenylist: ["/admin"],
        },
      );
      assert(!result.valid, "Navigation to /admin must be denied");
    },
  },
  {
    id: "F-04",
    name: "OrchestrationPolicy enforces operation limits",
    level: "full",
    async run(_ctx) {
      const { validateStateDelta } = await import("@h2a/core");
      const ops = Array.from({ length: 25 }, (_, i) => ({
        op: "fill" as const,
        target: `field_${i}`,
        value: "test",
      }));
      const result = validateStateDelta(ops, {
        rateLimits: { maxOperationsPerFrame: 20 },
      });
      assert(!result.valid, "25 operations with limit 20 must fail");
    },
  },
  {
    id: "F-05",
    name: "OrchestrationPolicy enforces path allowlist",
    level: "full",
    async run(_ctx) {
      const { validateStateDelta } = await import("@h2a/core");
      const result = validateStateDelta(
        [{ op: "navigate", target: "/settings/account" }],
        {
          allowedOperations: ["navigate"],
          navigationPathAllowlist: ["/dashboard/*", "/tasks/*"],
        },
      );
      assert(!result.valid, "Navigation outside allowlist must be denied");
    },
  },
  {
    id: "F-06",
    name: "Sanitizer strips script tags",
    level: "full",
    async run(_ctx) {
      const { sanitizeHtml } = await import("@h2a/core");
      const dirty = '<p>Hello</p><script>alert("xss")</script>';
      const clean = sanitizeHtml(dirty);
      assert(!clean.includes("script"), "Script tags must be stripped");
      assert(clean.includes("Hello"), "Content must be preserved");
    },
  },
  {
    id: "F-07",
    name: "Sanitizer strips javascript: protocol",
    level: "full",
    async run(_ctx) {
      const { sanitizeHtml } = await import("@h2a/core");
      const dirty = '<a href="javascript:alert(1)">click</a>';
      const clean = sanitizeHtml(dirty);
      assert(!clean.includes("javascript"), "javascript: protocol must be stripped");
    },
  },
  {
    id: "F-08",
    name: "Sanitizer strips event handlers",
    level: "full",
    async run(_ctx) {
      const { sanitizeHtml } = await import("@h2a/core");
      const dirty = '<img src="x" onerror="alert(1)">';
      const clean = sanitizeHtml(dirty);
      assert(!clean.includes("onerror"), "Event handlers must be stripped");
    },
  },
  {
    id: "F-09",
    name: "Valid message types pass validation",
    level: "full",
    async run(_ctx) {
      const { validateMessage } = await import("@h2a/core");

      const messages = [
        { type: "session.open", hostCapabilities: { rendering: ["text"] } },
        { type: "session.ack", sessionId: "s1", negotiatedCapabilities: { frameTypes: ["text"], conformanceLevel: "basic" } },
        { type: "agent.frame", id: "f1", frameType: "text", content: "hi" },
        { type: "user.signal", signalType: "message", content: { text: "hello" } },
        { type: "presence.update", state: "rest" },
        { type: "state.snapshot", timestamp: new Date().toISOString() },
      ];

      for (const msg of messages) {
        const result = validateMessage(msg);
        assert(result.valid, `${msg.type} should be valid: ${result.errors.join(", ")}`);
      }
    },
  },
  {
    id: "F-10",
    name: "Invalid messages fail validation",
    level: "full",
    async run(_ctx) {
      const { validateMessage } = await import("@h2a/core");

      assert(!validateMessage(null).valid, "null must fail");
      assert(!validateMessage({}).valid, "empty object must fail");
      assert(!validateMessage({ type: "unknown" }).valid, "unknown type must fail");
      assert(!validateMessage({ type: "agent.frame" }).valid, "frame without id must fail");
    },
  },
];

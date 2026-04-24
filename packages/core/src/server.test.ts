import { describe, it, expect, vi } from "vitest";
import { H2AServer, type H2ASession } from "./server.js";
import type { AgentCard, SessionOpen, UserSignal } from "./types.js";

function createTestCard(overrides?: Partial<AgentCard>): AgentCard {
  return {
    h2a: "0.1",
    name: "Test Agent",
    capabilities: { streaming: true, presence: true },
    frameTypes: ["text", "error", "end"],
    endpoint: { h2a: "/h2a/session" },
    ...overrides,
  };
}

function createWritable() {
  const chunks: string[] = [];
  return {
    writable: {
      write: (c: string) => { chunks.push(c); return true; },
      end: () => {},
    },
    chunks,
  };
}

function createSessionOpen(overrides?: Partial<SessionOpen>): SessionOpen {
  return {
    type: "session.open",
    hostCapabilities: {
      rendering: ["text", "error", "end"],
      conformanceLevel: "basic",
    },
    ...overrides,
  };
}

describe("H2AServer", () => {
  it("opens a session and sends ack", () => {
    const onSignal = vi.fn();
    const server = new H2AServer({ agentCard: createTestCard(), onSignal });
    const { writable, chunks } = createWritable();

    const session = server.handleSessionRequest(createSessionOpen(), writable);
    expect(session).not.toBeNull();
    expect(session!.id).toBeTruthy();
    expect(server.sessionCount).toBe(1);

    expect(chunks).toHaveLength(1);
    const ack = JSON.parse(chunks[0].split("data: ")[1]);
    expect(ack.type).toBe("session.ack");
    expect(ack.sessionId).toBe(session!.id);

    server.destroy();
  });

  it("negotiates capabilities", () => {
    const server = new H2AServer({
      agentCard: createTestCard({ frameTypes: ["text", "tool_card", "error", "end"] }),
      onSignal: vi.fn(),
    });
    const { writable } = createWritable();

    const session = server.handleSessionRequest(
      createSessionOpen({ hostCapabilities: { rendering: ["text", "end"], conformanceLevel: "standard" } }),
      writable,
    );

    expect(session!.negotiated.frameTypes).toEqual(["text", "end"]);
    expect(session!.negotiated.conformanceLevel).toBe("basic");
    server.destroy();
  });

  it("sends frames with auto-incrementing sequence", () => {
    const server = new H2AServer({ agentCard: createTestCard(), onSignal: vi.fn() });
    const { writable, chunks } = createWritable();
    const session = server.handleSessionRequest(createSessionOpen(), writable)!;

    server.sendFrame(session.id, { id: "f1", frameType: "text", content: { text: "hello" } });
    server.sendFrame(session.id, { id: "f2", frameType: "text", content: { text: "world" } });

    const frame1 = JSON.parse(chunks[1].split("data: ")[1]);
    const frame2 = JSON.parse(chunks[2].split("data: ")[1]);
    expect(frame1.sequence).toBe(1);
    expect(frame2.sequence).toBe(2);
    expect(frame1.type).toBe("agent.frame");

    server.destroy();
  });

  it("sends presence updates through state machine", () => {
    const server = new H2AServer({
      agentCard: createTestCard({ capabilities: { streaming: true, presence: true } }),
      onSignal: vi.fn(),
    });
    const { writable, chunks } = createWritable();
    const session = server.handleSessionRequest(createSessionOpen(), writable)!;

    expect(server.sendPresence(session.id, "attentive", "detect")).toBe(true);
    expect(server.sendPresence(session.id, "orchestrating", "skip")).toBe(false);

    const presence = JSON.parse(chunks[1].split("data: ")[1]);
    expect(presence.type).toBe("presence.update");
    expect(presence.state).toBe("attentive");

    server.destroy();
  });

  it("handles signals through callback", async () => {
    const onSignal = vi.fn();
    const server = new H2AServer({ agentCard: createTestCard(), onSignal });
    const { writable } = createWritable();
    const session = server.handleSessionRequest(createSessionOpen(), writable)!;

    const signal: UserSignal = { type: "user.signal", signalType: "message", content: { text: "hi" } };
    const result = await server.handleSignal(session.id, signal);

    expect(result).toBe(true);
    expect(onSignal).toHaveBeenCalledWith(session, signal);

    server.destroy();
  });

  it("rejects signals for unknown sessions", async () => {
    const server = new H2AServer({ agentCard: createTestCard(), onSignal: vi.fn() });
    const result = await server.handleSignal("nonexistent", { type: "user.signal", signalType: "message" });
    expect(result).toBe(false);
    server.destroy();
  });

  it("enforces max sessions", () => {
    const server = new H2AServer({ agentCard: createTestCard(), onSignal: vi.fn(), maxSessions: 1 });

    const { writable: w1 } = createWritable();
    const { writable: w2 } = createWritable();

    const s1 = server.handleSessionRequest(createSessionOpen(), w1);
    const s2 = server.handleSessionRequest(createSessionOpen(), w2);

    expect(s1).not.toBeNull();
    expect(s2).toBeNull();

    server.destroy();
  });

  it("closes a session", () => {
    const server = new H2AServer({ agentCard: createTestCard(), onSignal: vi.fn() });
    const { writable } = createWritable();
    const session = server.handleSessionRequest(createSessionOpen(), writable)!;

    server.closeSession(session.id);
    expect(server.sessionCount).toBe(0);
    expect(server.getSession(session.id)).toBeUndefined();

    server.destroy();
  });

  it("resumes an existing session", () => {
    const server = new H2AServer({ agentCard: createTestCard(), onSignal: vi.fn() });
    const { writable: w1, chunks: c1 } = createWritable();
    const session = server.handleSessionRequest(createSessionOpen(), w1)!;

    const { writable: w2, chunks: c2 } = createWritable();
    const resumed = server.handleSessionRequest(
      { type: "session.resume", sessionId: session.id, lastReceivedSequence: 0 },
      w2,
    );

    expect(resumed).not.toBeNull();
    expect(resumed!.id).toBe(session.id);
    expect(c2).toHaveLength(1);

    server.destroy();
  });
});

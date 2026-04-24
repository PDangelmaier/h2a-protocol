import { describe, it, expect, vi, beforeEach } from "vitest";
import { H2AStream } from "./stream.js";

function mockFetchResponse(chunks: string[]): void {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    body: stream,
  } as unknown as Response);
}

describe("H2AStream", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("converts text frames into plain text chunks", async () => {
    mockFetchResponse([
      'event: session.ack\ndata: {"type":"session.ack","sessionId":"s1","negotiatedCapabilities":{"frameTypes":["text"],"conformanceLevel":"basic"}}\n\n',
      'event: agent.frame\ndata: {"type":"agent.frame","id":"f1","frameType":"text","content":"Hello ","streaming":true}\n\n',
      'event: agent.frame\ndata: {"type":"agent.frame","id":"f2","frameType":"text","content":"world","streaming":true,"final":true}\n\n',
      'event: agent.frame\ndata: {"type":"agent.frame","id":"f3","frameType":"end","content":{"reason":"complete"}}\n\n',
    ]);

    const stream = H2AStream({ endpoint: "http://test:8100" });
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }

    expect(result).toBe("Hello world");
  });

  it("invokes onPresence for presence updates", async () => {
    const onPresence = vi.fn();

    mockFetchResponse([
      'event: session.ack\ndata: {"type":"session.ack","sessionId":"s1","negotiatedCapabilities":{"frameTypes":["text"],"conformanceLevel":"basic"}}\n\n',
      'event: presence.update\ndata: {"type":"presence.update","state":"conversing","trigger":"user_message"}\n\n',
      'event: agent.frame\ndata: {"type":"agent.frame","id":"f1","frameType":"end","content":{"reason":"complete"}}\n\n',
    ]);

    const stream = H2AStream({ endpoint: "http://test:8100", onPresence });
    const reader = stream.getReader();
    while (!(await reader.read()).done) {}

    expect(onPresence).toHaveBeenCalledWith(
      expect.objectContaining({ state: "conversing", trigger: "user_message" }),
    );
  });

  it("invokes onSessionAck with session info", async () => {
    const onSessionAck = vi.fn();

    mockFetchResponse([
      'event: session.ack\ndata: {"type":"session.ack","sessionId":"abc123","negotiatedCapabilities":{"frameTypes":["text"],"conformanceLevel":"standard"}}\n\n',
      'event: agent.frame\ndata: {"type":"agent.frame","id":"f1","frameType":"end","content":{"reason":"complete"}}\n\n',
    ]);

    const stream = H2AStream({ endpoint: "http://test:8100", onSessionAck });
    const reader = stream.getReader();
    while (!(await reader.read()).done) {}

    expect(onSessionAck).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "abc123" }),
    );
  });

  it("sends non-text frames as data messages", async () => {
    const onNonTextFrame = vi.fn();

    mockFetchResponse([
      'event: session.ack\ndata: {"type":"session.ack","sessionId":"s1","negotiatedCapabilities":{"frameTypes":["text","tool_card"],"conformanceLevel":"standard"}}\n\n',
      'event: agent.frame\ndata: {"type":"agent.frame","id":"f1","frameType":"tool_card","content":{"tool":"search","status":"running"}}\n\n',
      'event: agent.frame\ndata: {"type":"agent.frame","id":"f2","frameType":"end","content":{"reason":"complete"}}\n\n',
    ]);

    const stream = H2AStream({ endpoint: "http://test:8100", onNonTextFrame });
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }

    expect(onNonTextFrame).toHaveBeenCalledWith(
      expect.objectContaining({ frameType: "tool_card" }),
    );
    expect(result).toContain("tool_card");
  });

  it("errors on non-200 response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      body: null,
    } as unknown as Response);

    const stream = H2AStream({ endpoint: "http://test:8100" });
    const reader = stream.getReader();

    await expect(reader.read()).rejects.toThrow("H2A connection failed: 503");
  });
});

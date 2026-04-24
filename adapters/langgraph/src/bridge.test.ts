import { describe, it, expect, vi, beforeEach } from "vitest";
import { H2ALangGraphBridge, type LangGraphEvent } from "./bridge.js";

function createMockH2A() {
  return {
    sendFrame: vi.fn().mockReturnValue(true),
    sendPresence: vi.fn().mockReturnValue(true),
  };
}

describe("H2ALangGraphBridge", () => {
  let mockH2A: ReturnType<typeof createMockH2A>;
  let bridge: H2ALangGraphBridge;

  beforeEach(() => {
    mockH2A = createMockH2A();
    bridge = new H2ALangGraphBridge({
      h2a: mockH2A as any,
      sessionId: "test-session",
    });
  });

  it("converts on_llm_stream to text frames", () => {
    bridge.processEvent({
      event: "on_llm_stream",
      data: { chunk: { content: "Hello" } },
    });

    expect(mockH2A.sendFrame).toHaveBeenCalledWith("test-session", {
      id: expect.stringContaining("lg_"),
      frameType: "text",
      content: "Hello",
      streaming: true,
      final: false,
    });
  });

  it("converts on_llm_end to final text frame", () => {
    bridge.processEvent({ event: "on_llm_end", data: {} });

    expect(mockH2A.sendFrame).toHaveBeenCalledWith("test-session", {
      id: expect.any(String),
      frameType: "text",
      content: "",
      streaming: true,
      final: true,
    });
  });

  it("converts on_tool_start to tool_card frame", () => {
    bridge.processEvent({
      event: "on_tool_start",
      name: "web_search",
      data: { input: { query: "H2A protocol" } },
    });

    expect(mockH2A.sendPresence).toHaveBeenCalledWith(
      "test-session", "orchestrating", "tool:web_search",
    );
    expect(mockH2A.sendFrame).toHaveBeenCalledWith("test-session", {
      id: expect.any(String),
      frameType: "tool_card",
      content: { tool: "web_search", input: { query: "H2A protocol" }, status: "running" },
    });
  });

  it("converts on_tool_end to completed tool_card", () => {
    bridge.processEvent({
      event: "on_tool_end",
      name: "web_search",
      data: { output: "Result text" },
    });

    expect(mockH2A.sendFrame).toHaveBeenCalledWith("test-session", {
      id: expect.any(String),
      frameType: "tool_card",
      content: { tool: "web_search", output: "Result text", status: "completed" },
    });
    expect(mockH2A.sendPresence).toHaveBeenCalledWith(
      "test-session", "conversing", "tool_complete:web_search",
    );
  });

  it("converts on_chain_start to progress frame", () => {
    bridge.processEvent({
      event: "on_chain_start",
      name: "research_node",
      data: {},
    });

    expect(mockH2A.sendFrame).toHaveBeenCalledWith("test-session", {
      id: expect.any(String),
      frameType: "progress",
      content: { task: "research_node", message: "Running research_node..." },
    });
  });

  it("processes full stream with presence transitions", async () => {
    async function* fakeStream(): AsyncIterable<LangGraphEvent> {
      yield { event: "on_llm_stream", data: { chunk: { content: "Hi " } } };
      yield { event: "on_tool_start", name: "calc", data: { input: {} } };
      yield { event: "on_tool_end", name: "calc", data: { output: "42" } };
      yield { event: "on_llm_stream", data: { chunk: { content: "done" } } };
      yield { event: "on_llm_end", data: {} };
    }

    await bridge.processStream(fakeStream());

    const frameCalls = mockH2A.sendFrame.mock.calls;
    expect(frameCalls.length).toBe(6); // 2 text + 2 tool_card + 1 final text + 1 end
    expect(frameCalls[frameCalls.length - 1][1].frameType).toBe("end");

    expect(mockH2A.sendPresence).toHaveBeenCalledWith(
      "test-session", "conversing", "langgraph_stream_start",
    );
    expect(mockH2A.sendPresence).toHaveBeenCalledWith(
      "test-session", "rest", "langgraph_stream_end",
    );
  });

  it("skips tool frames when toolFrameEnabled is false", () => {
    bridge = new H2ALangGraphBridge({
      h2a: mockH2A as any,
      sessionId: "test-session",
      toolFrameEnabled: false,
    });

    bridge.processEvent({
      event: "on_tool_start",
      name: "search",
      data: { input: {} },
    });

    expect(mockH2A.sendFrame).not.toHaveBeenCalled();
  });

  it("sends error frame", () => {
    bridge.sendError("Something broke", "AGENT_OVERLOADED");

    expect(mockH2A.sendFrame).toHaveBeenCalledWith("test-session", {
      id: expect.any(String),
      frameType: "error",
      content: { code: "AGENT_OVERLOADED", message: "Something broke" },
      final: true,
    });
  });
});

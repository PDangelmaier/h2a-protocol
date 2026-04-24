import { describe, it, expect, vi } from "vitest";
import { echoScenario, slowStreamScenario, orchestrateScenario, errorScenario, getScenario } from "./scenarios.js";
import type { FrameSender } from "./scenarios.js";
import type { H2ASession } from "@h2a/core";

function createMockSender() {
  const calls: { method: string; args: unknown[] }[] = [];
  const sender: FrameSender = {
    text: (...args) => { calls.push({ method: "text", args }); },
    progress: (...args) => { calls.push({ method: "progress", args }); },
    toolCard: (...args) => { calls.push({ method: "toolCard", args }); },
    confirmation: (...args) => { calls.push({ method: "confirmation", args }); },
    toast: (...args) => { calls.push({ method: "toast", args }); },
    error: (...args) => { calls.push({ method: "error", args }); },
    end: (...args) => { calls.push({ method: "end", args }); },
    presence: (...args) => { calls.push({ method: "presence", args }); },
  };
  return { sender, calls };
}

const mockSession = {} as H2ASession;

describe("echoScenario", () => {
  it("echoes input and transitions presence", async () => {
    const { sender, calls } = createMockSender();
    await echoScenario.handle(mockSession, "Hello", sender);

    expect(calls[0]).toEqual({ method: "presence", args: ["conversing", "user_message"] });
    expect(calls[1].method).toBe("text");
    expect(calls[1].args[1]).toBe("Echo: Hello");
    expect(calls[2].method).toBe("end");
    expect(calls[3]).toEqual({ method: "presence", args: ["rest", "response_complete"] });
  });
});

describe("slowStreamScenario", () => {
  it("streams multiple text chunks", async () => {
    const { sender, calls } = createMockSender();
    await slowStreamScenario.handle(mockSession, "test", sender);

    const textCalls = calls.filter((c) => c.method === "text");
    expect(textCalls.length).toBeGreaterThan(1);

    const lastText = textCalls[textCalls.length - 1];
    expect(lastText.args[2]).toEqual({ streaming: true, final: true });

    expect(calls[0]).toEqual({ method: "presence", args: ["conversing", "user_message"] });
    expect(calls[calls.length - 1]).toEqual({ method: "presence", args: ["rest", "response_complete"] });
  });
});

describe("orchestrateScenario", () => {
  it("produces tool_card, progress, confirmation, toast, and end frames", async () => {
    const { sender, calls } = createMockSender();
    await orchestrateScenario.handle(mockSession, "query", sender);

    const methods = calls.map((c) => c.method);
    expect(methods).toContain("text");
    expect(methods).toContain("toolCard");
    expect(methods).toContain("progress");
    expect(methods).toContain("confirmation");
    expect(methods).toContain("toast");
    expect(methods).toContain("end");
    expect(methods).toContain("presence");
  });

  it("transitions to orchestrating for tool execution", async () => {
    const { sender, calls } = createMockSender();
    await orchestrateScenario.handle(mockSession, "query", sender);

    const presenceCalls = calls.filter((c) => c.method === "presence");
    const states = presenceCalls.map((c) => c.args[0]);
    expect(states).toContain("orchestrating");
    expect(states[states.length - 1]).toBe("rest");
  });
});

describe("errorScenario", () => {
  it("sends partial text then error", async () => {
    const { sender, calls } = createMockSender();
    await errorScenario.handle(mockSession, "fail", sender);

    const methods = calls.map((c) => c.method);
    expect(methods).toContain("text");
    expect(methods).toContain("error");
  });
});

describe("getScenario", () => {
  it("finds scenarios by name", () => {
    expect(getScenario("echo")?.name).toBe("echo");
    expect(getScenario("slow-stream")?.name).toBe("slow-stream");
    expect(getScenario("orchestrate")?.name).toBe("orchestrate");
    expect(getScenario("error")?.name).toBe("error");
    expect(getScenario("nonexistent")).toBeUndefined();
  });
});

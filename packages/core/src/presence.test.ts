import { describe, it, expect, vi, afterEach } from "vitest";
import { PresenceStateMachine } from "./presence.js";

describe("PresenceStateMachine", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("starts in the given initial state", () => {
    const sm = new PresenceStateMachine("attentive");
    expect(sm.current).toBe("attentive");
    sm.destroy();
  });

  it("defaults to rest", () => {
    const sm = new PresenceStateMachine();
    expect(sm.current).toBe("rest");
    sm.destroy();
  });

  it("transitions through valid states", () => {
    const sm = new PresenceStateMachine();
    expect(sm.transition("attentive", "detect")).toBe(true);
    expect(sm.current).toBe("attentive");
    expect(sm.transition("conversing", "engage")).toBe(true);
    expect(sm.current).toBe("conversing");
    expect(sm.transition("orchestrating", "tool_use")).toBe(true);
    expect(sm.current).toBe("orchestrating");
    expect(sm.transition("rest", "complete")).toBe(true);
    expect(sm.current).toBe("rest");
    sm.destroy();
  });

  it("rejects invalid transitions", () => {
    const sm = new PresenceStateMachine();
    expect(sm.transition("conversing", "skip")).toBe(false);
    expect(sm.current).toBe("rest");
    expect(sm.transition("orchestrating", "skip")).toBe(false);
    expect(sm.current).toBe("rest");
    sm.destroy();
  });

  it("records transition history", () => {
    const sm = new PresenceStateMachine();
    sm.transition("attentive", "detect");
    sm.transition("conversing", "engage");

    expect(sm.transitions).toHaveLength(2);
    expect(sm.transitions[0]).toEqual({ from: "rest", to: "attentive", trigger: "detect" });
    expect(sm.transitions[1]).toEqual({ from: "attentive", to: "conversing", trigger: "engage" });
    sm.destroy();
  });

  it("canTransition reports correctly", () => {
    const sm = new PresenceStateMachine();
    expect(sm.canTransition("attentive")).toBe(true);
    expect(sm.canTransition("conversing")).toBe(false);
    expect(sm.canTransition("orchestrating")).toBe(false);
    expect(sm.canTransition("rest")).toBe(false);
    sm.destroy();
  });

  it("notifies listeners on transition", () => {
    const sm = new PresenceStateMachine();
    const listener = vi.fn();
    sm.onTransition(listener);

    sm.transition("attentive", "detect", 0.9);
    expect(listener).toHaveBeenCalledWith({
      type: "presence.update",
      state: "attentive",
      confidence: 0.9,
      trigger: "detect",
    });
    sm.destroy();
  });

  it("unsubscribe stops notifications", () => {
    const sm = new PresenceStateMachine();
    const listener = vi.fn();
    const unsub = sm.onTransition(listener);

    sm.transition("attentive", "detect");
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    sm.transition("conversing", "engage");
    expect(listener).toHaveBeenCalledTimes(1);
    sm.destroy();
  });

  it("idle timeout transitions to rest", async () => {
    vi.useFakeTimers();
    const sm = new PresenceStateMachine("rest", 500);
    sm.transition("attentive", "detect");

    vi.advanceTimersByTime(500);
    expect(sm.current).toBe("rest");
    sm.destroy();
    vi.useRealTimers();
  });

  it("idle timer resets on each transition", async () => {
    vi.useFakeTimers();
    const sm = new PresenceStateMachine("rest", 500);
    sm.transition("attentive", "detect");

    vi.advanceTimersByTime(300);
    sm.transition("conversing", "engage");

    vi.advanceTimersByTime(300);
    expect(sm.current).toBe("conversing");

    vi.advanceTimersByTime(200);
    expect(sm.current).toBe("rest");
    sm.destroy();
    vi.useRealTimers();
  });

  it("destroy clears timer and listeners", () => {
    vi.useFakeTimers();
    const sm = new PresenceStateMachine("rest", 500);
    const listener = vi.fn();
    sm.onTransition(listener);
    sm.transition("attentive", "detect");

    sm.destroy();
    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

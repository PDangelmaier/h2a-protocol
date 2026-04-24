import type { PresenceState, PresenceUpdate } from "./types.js";

export type PresenceTransition = {
  from: PresenceState;
  to: PresenceState;
  trigger: string;
};

export type PresenceListener = (update: PresenceUpdate) => void;

const VALID_TRANSITIONS: Record<PresenceState, PresenceState[]> = {
  rest: ["attentive"],
  attentive: ["rest", "conversing"],
  conversing: ["rest", "orchestrating"],
  orchestrating: ["rest", "conversing"],
};

export class PresenceStateMachine {
  private state: PresenceState;
  private listeners: PresenceListener[] = [];
  private history: PresenceTransition[] = [];
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimeoutMs: number;

  constructor(initial: PresenceState = "rest", idleTimeoutMs = 30_000) {
    this.state = initial;
    this.idleTimeoutMs = idleTimeoutMs;
  }

  get current(): PresenceState {
    return this.state;
  }

  get transitions(): readonly PresenceTransition[] {
    return this.history;
  }

  canTransition(to: PresenceState): boolean {
    return VALID_TRANSITIONS[this.state].includes(to);
  }

  transition(to: PresenceState, trigger: string, confidence = 1.0): boolean {
    if (!this.canTransition(to)) return false;

    const from = this.state;
    this.state = to;
    this.history.push({ from, to, trigger });
    this.resetIdleTimer();

    const update: PresenceUpdate = {
      type: "presence.update",
      state: to,
      confidence,
      trigger,
    };

    for (const listener of this.listeners) {
      listener(update);
    }

    return true;
  }

  onTransition(listener: PresenceListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    if (this.state !== "rest") {
      this.idleTimer = setTimeout(() => {
        this.transition("rest", "idle_timeout", 0.5);
      }, this.idleTimeoutMs);
    }
  }

  destroy(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.listeners = [];
  }
}

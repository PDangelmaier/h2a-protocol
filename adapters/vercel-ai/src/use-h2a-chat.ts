/**
 * Drop-in replacement for Vercel AI SDK's useChat that speaks H2A natively.
 *
 * Maintains the same API surface (messages, input, handleSubmit, isLoading)
 * but adds H2A-specific features: presence, typed frames, interrupts.
 */

import { H2AClient, type AgentFrame, type PresenceUpdate, type SessionAck, type PresenceState } from "@h2a/core";

export interface UseH2AChatOptions {
  endpoint: string;
  headers?: Record<string, string>;
  locale?: string;
  onFrame?: (frame: AgentFrame) => void;
  onPresence?: (state: PresenceState) => void;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface UseH2AChatReturn {
  messages: ChatMessage[];
  input: string;
  isLoading: boolean;
  presence: PresenceState;
  frames: AgentFrame[];
  setInput: (value: string) => void;
  handleSubmit: () => void;
  interrupt: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
}

interface State {
  messages: ChatMessage[];
  input: string;
  isLoading: boolean;
  presence: PresenceState;
  frames: AgentFrame[];
  connected: boolean;
}

let idCounter = 0;
function nextId(): string {
  return `msg_${++idCounter}`;
}

/**
 * Framework-agnostic H2A chat state manager.
 * For React, wrap this with useState/useEffect. For vanilla JS, use directly.
 */
export function createH2AChatManager(options: UseH2AChatOptions) {
  const state: State = {
    messages: [],
    input: "",
    isLoading: false,
    presence: "rest",
    frames: [],
    connected: false,
  };

  let streamingContent = "";
  let listeners: (() => void)[] = [];

  function notify() {
    for (const fn of listeners) fn();
  }

  const client = new H2AClient({
    endpoint: options.endpoint,
    headers: options.headers,
    onFrame(frame: AgentFrame) {
      state.frames = [...state.frames, frame];

      if (frame.frameType === "text") {
        const text = typeof frame.content === "string"
          ? frame.content
          : (frame.content as { text?: string })?.text ?? "";
        streamingContent += text;

        const lastMsg = state.messages[state.messages.length - 1];
        if (lastMsg?.role === "assistant") {
          lastMsg.content = streamingContent;
          state.messages = [...state.messages];
        } else {
          state.messages = [...state.messages, { id: nextId(), role: "assistant", content: streamingContent }];
        }
      }

      if (frame.frameType === "end") {
        state.isLoading = false;
        streamingContent = "";
      }

      options.onFrame?.(frame);
      notify();
    },
    onPresence(update: PresenceUpdate) {
      state.presence = update.state as PresenceState;
      options.onPresence?.(state.presence);
      notify();
    },
    onSessionAck(_ack: SessionAck) {
      state.connected = true;
      notify();
    },
    onError(error: Error) {
      state.isLoading = false;
      state.frames = [...state.frames, {
        type: "agent.frame",
        id: `err_${Date.now()}`,
        frameType: "error",
        content: { code: "INTERNAL_ERROR", message: error.message },
        final: true,
      }];
      notify();
    },
    onDisconnect() {
      state.connected = false;
      state.isLoading = false;
      notify();
    },
  });

  return {
    get state() { return state; },

    subscribe(fn: () => void) {
      listeners.push(fn);
      return () => { listeners = listeners.filter((l) => l !== fn); };
    },

    async connect() {
      await client.connect({
        type: "session.open",
        hostCapabilities: {
          rendering: ["text", "tool_card", "progress", "confirmation", "toast", "error", "end"],
        },
        locale: options.locale ?? "en-US",
      });
    },

    setInput(value: string) {
      state.input = value;
      notify();
    },

    async handleSubmit() {
      const text = state.input.trim();
      if (!text) return;

      state.messages = [...state.messages, { id: nextId(), role: "user", content: text }];
      state.input = "";
      state.isLoading = true;
      streamingContent = "";
      notify();

      await client.sendMessage(text);
    },

    async interrupt() {
      await client.interrupt();
    },

    disconnect() {
      client.disconnect();
      state.connected = false;
      notify();
    },
  };
}

/**
 * Convenience wrapper returning the UseH2AChatReturn shape.
 * In React, use the @h2a/react package instead which provides proper hooks.
 */
export function useH2AChat(options: UseH2AChatOptions): UseH2AChatReturn {
  const manager = createH2AChatManager(options);

  return {
    get messages() { return manager.state.messages; },
    get input() { return manager.state.input; },
    get isLoading() { return manager.state.isLoading; },
    get presence() { return manager.state.presence; },
    get frames() { return manager.state.frames; },
    setInput: manager.setInput,
    handleSubmit: manager.handleSubmit,
    interrupt: manager.interrupt,
    connect: manager.connect,
    disconnect: manager.disconnect,
  };
}

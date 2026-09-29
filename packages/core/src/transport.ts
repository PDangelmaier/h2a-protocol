import type {
  AgentFrame,
  H2AMessage,
  PresenceUpdate,
  SessionAck,
  SessionOpen,
  UserSignal,
  StateSnapshot,
  StateDiff,
} from "./types.js";

// ── SSE Client (Host-side) ──

export interface H2AClientOptions {
  endpoint: string;
  headers?: Record<string, string>;
  onFrame: (frame: AgentFrame) => void;
  onPresence: (update: PresenceUpdate) => void;
  onSessionAck: (ack: SessionAck) => void;
  onError: (error: Error) => void;
  onDisconnect: () => void;
  maxFramesPerResponse?: number;
  maxBytesPerResponse?: number;
}

export class H2AClient {
  private endpoint: string;
  private headers: Record<string, string>;
  private callbacks: Omit<H2AClientOptions, "endpoint" | "headers" | "maxFramesPerResponse" | "maxBytesPerResponse">;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private sessionId: string | null = null;
  private lastSequence = 0;
  private frameCount = 0;
  private maxFrames: number;
  private maxBytes: number;
  private byteCount = 0;
  private disconnected = false;

  constructor(options: H2AClientOptions) {
    this.endpoint = options.endpoint;
    this.headers = options.headers ?? {};
    this.callbacks = options;
    this.maxFrames = options.maxFramesPerResponse ?? 500;
    this.maxBytes = options.maxBytesPerResponse ?? 5 * 1024 * 1024;
  }

  async connect(sessionOpen: SessionOpen): Promise<void> {
    const response = await fetch(`${this.endpoint}/h2a/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.headers },
      body: JSON.stringify(sessionOpen),
    });

    if (!response.ok) {
      throw new Error(`H2A session failed: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body for SSE stream");
    }

    this.readSSEStream(response.body);
  }

  async resume(): Promise<void> {
    if (!this.sessionId) throw new Error("No session to resume");

    const response = await fetch(`${this.endpoint}/h2a/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.headers },
      body: JSON.stringify({
        type: "session.resume",
        sessionId: this.sessionId,
        lastReceivedSequence: this.lastSequence,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`H2A resume failed: ${response.status}`);
    }

    this.readSSEStream(response.body);
  }

  async sendSignal(signal: UserSignal): Promise<void> {
    const response = await fetch(`${this.endpoint}/h2a/signal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.sessionId ? { "X-H2A-Session": this.sessionId } : {}),
        ...this.headers,
      },
      body: JSON.stringify(signal),
    });

    if (!response.ok) {
      throw new Error(`H2A signal failed: ${response.status}`);
    }
  }

  async sendStateSnapshot(snapshot: StateSnapshot): Promise<void> {
    await this.sendSignal({
      type: "user.signal",
      signalType: "context_change",
      content: snapshot,
    });
  }

  async sendStateDiff(diff: StateDiff): Promise<void> {
    await this.sendSignal({
      type: "user.signal",
      signalType: "context_change",
      content: diff,
    });
  }

  async sendMessage(text: string, attachments?: { mimeType: string; name: string; uri: string }[]): Promise<void> {
    await this.sendSignal({
      type: "user.signal",
      signalType: "message",
      content: { text },
      context: attachments ? { attachments } : undefined,
    });
  }

  async interrupt(): Promise<void> {
    await this.sendSignal({
      type: "user.signal",
      signalType: "interrupt",
      content: { scope: "current" },
    });
  }

  async confirm(frameId: string, choice: string): Promise<void> {
    await this.sendSignal({
      type: "user.signal",
      signalType: "confirm",
      content: { frameId, choice },
    });
  }

  async deny(frameId: string, reason?: string): Promise<void> {
    await this.sendSignal({
      type: "user.signal",
      signalType: "deny",
      content: { frameId, reason },
    });
  }

  disconnect(): void {
    this.disconnected = true;
    this.reader?.cancel().catch(() => {});
    this.reader = null;
  }

  get session(): string | null {
    return this.sessionId;
  }

  get sequence(): number {
    return this.lastSequence;
  }

  private readSSEStream(body: ReadableStream<Uint8Array>): void {
    this.disconnected = false;
    const reader = body.getReader();
    this.reader = reader;
    const decoder = new TextDecoder();
    let buffer = "";

    const pump = (): void => {
      reader
        .read()
        .then(({ done, value }) => {
          if (done || this.disconnected) {
            this.callbacks.onDisconnect();
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          this.byteCount += chunk.length;

          if (this.byteCount > this.maxBytes) {
            reader.cancel();
            this.callbacks.onError(new Error("H2A byte limit exceeded"));
            return;
          }

          buffer += chunk;
          const events = this.parseSSEBuffer(buffer);
          buffer = events.remainder;

          for (const event of events.parsed) {
            this.handleSSEEvent(event);
          }

          pump();
        })
        .catch((err) => {
          this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        });
    };

    pump();
  }

  private parseSSEBuffer(buffer: string): {
    parsed: { event: string; data: string; id?: string }[];
    remainder: string;
  } {
    const parsed: { event: string; data: string; id?: string }[] = [];
    const blocks = buffer.split("\n\n");
    const remainder = blocks.pop() ?? "";

    for (const block of blocks) {
      if (!block.trim()) continue;

      let event = "message";
      let data = "";
      let id: string | undefined;

      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
        else if (line.startsWith("id: ")) id = line.slice(4);
        else if (line.startsWith(": ")) continue; // keepalive comment
      }

      if (data) parsed.push({ event, data, id });
    }

    return { parsed, remainder };
  }

  private handleSSEEvent(event: { event: string; data: string; id?: string }): void {
    let message: H2AMessage;
    try {
      message = JSON.parse(event.data) as H2AMessage;
    } catch {
      this.callbacks.onError(new Error(`Invalid H2A JSON: ${event.data.slice(0, 100)}`));
      return;
    }

    switch (message.type) {
      case "session.ack": {
        const ack = message as SessionAck;
        this.sessionId = ack.sessionId;
        this.frameCount = 0;
        this.byteCount = 0;
        this.callbacks.onSessionAck(ack);
        break;
      }
      case "agent.frame": {
        const frame = message as AgentFrame;
        this.frameCount++;

        if (this.frameCount > this.maxFrames) {
          this.callbacks.onError(new Error("H2A frame limit exceeded"));
          this.disconnect();
          return;
        }

        if (frame.sequence !== undefined) {
          this.lastSequence = Math.max(this.lastSequence, frame.sequence);
        }

        this.callbacks.onFrame(frame);
        break;
      }
      case "presence.update":
        this.callbacks.onPresence(message as PresenceUpdate);
        break;
      default:
        break;
    }
  }
}

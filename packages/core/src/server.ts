import type {
  AgentCard,
  AgentFrame,
  ConformanceLevel,
  FrameType,
  H2AMessage,
  HostCapabilities,
  NegotiatedCapabilities,
  PresenceState,
  PresenceUpdate,
  SessionAck,
  SessionOpen,
  SessionResume,
  UserSignal,
} from "./types.js";
import { PresenceStateMachine } from "./presence.js";

// ── SSE Server (Agent-side) ──

export interface H2ASession {
  id: string;
  negotiated: NegotiatedCapabilities;
  hostCapabilities: HostCapabilities;
  presence: PresenceStateMachine;
  sequence: number;
  createdAt: number;
  writer: WritableStreamDefaultWriter<Uint8Array> | null;
}

export interface H2AServerOptions {
  agentCard: AgentCard;
  onSignal: (session: H2ASession, signal: UserSignal) => void | Promise<void>;
  idleTimeoutMs?: number;
  maxSessions?: number;
}

type SSEWritable = { write(chunk: string): boolean; end(): void };

export class H2AServer {
  private sessions = new Map<string, H2ASession>();
  private sseWriters = new Map<string, SSEWritable>();
  private agentCard: AgentCard;
  private onSignal: H2AServerOptions["onSignal"];
  private idleTimeoutMs: number;
  private maxSessions: number;

  constructor(options: H2AServerOptions) {
    this.agentCard = options.agentCard;
    this.onSignal = options.onSignal;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30_000;
    this.maxSessions = options.maxSessions ?? 100;
  }

  get card(): AgentCard {
    return this.agentCard;
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  getSession(id: string): H2ASession | undefined {
    return this.sessions.get(id);
  }

  handleSessionRequest(
    body: SessionOpen | SessionResume,
    writable: SSEWritable,
  ): H2ASession | null {
    if (body.type === "session.resume") {
      return this.handleResume(body as SessionResume, writable);
    }
    return this.handleOpen(body as SessionOpen, writable);
  }

  private handleOpen(
    open: SessionOpen,
    writable: SSEWritable,
  ): H2ASession | null {
    if (this.sessions.size >= this.maxSessions) return null;

    const sessionId = open.sessionId ?? generateSessionId();
    const negotiated = this.negotiate(open.hostCapabilities);
    const presence = new PresenceStateMachine("rest", this.idleTimeoutMs);

    const session: H2ASession = {
      id: sessionId,
      negotiated,
      hostCapabilities: open.hostCapabilities,
      presence,
      sequence: 0,
      createdAt: Date.now(),
      writer: null,
    };

    this.sessions.set(sessionId, session);
    this.sseWriters.set(sessionId, writable);

    const ack: SessionAck = {
      type: "session.ack",
      sessionId,
      negotiatedCapabilities: negotiated,
    };

    this.writeSSE(sessionId, "session.ack", ack);
    return session;
  }

  private handleResume(
    resume: SessionResume,
    writable: SSEWritable,
  ): H2ASession | null {
    const session = this.sessions.get(resume.sessionId);
    if (!session) return null;

    this.sseWriters.set(resume.sessionId, writable);

    const ack: SessionAck = {
      type: "session.ack",
      sessionId: resume.sessionId,
      negotiatedCapabilities: session.negotiated,
    };

    this.writeSSE(resume.sessionId, "session.ack", ack);
    return session;
  }

  async handleSignal(sessionId: string, signal: UserSignal): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    await this.onSignal(session, signal);
    return true;
  }

  sendFrame(sessionId: string, frame: Omit<AgentFrame, "type" | "sequence">): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.sequence++;
    const fullFrame: AgentFrame = {
      type: "agent.frame",
      sequence: session.sequence,
      ...frame,
    };

    this.writeSSE(sessionId, "agent.frame", fullFrame);
    return true;
  }

  sendPresence(sessionId: string, state: PresenceState, trigger: string, confidence = 1.0): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (!session.presence.canTransition(state)) return false;
    session.presence.transition(state, trigger, confidence);

    const update: PresenceUpdate = {
      type: "presence.update",
      state,
      confidence,
      trigger,
    };

    this.writeSSE(sessionId, "presence.update", update);
    return true;
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.presence.destroy();
    const writer = this.sseWriters.get(sessionId);
    if (writer) {
      writer.end();
      this.sseWriters.delete(sessionId);
    }
    this.sessions.delete(sessionId);
  }

  destroy(): void {
    for (const id of this.sessions.keys()) {
      this.closeSession(id);
    }
  }

  private negotiate(host: HostCapabilities): NegotiatedCapabilities {
    const agentFrameTypes = this.agentCard.frameTypes ?? [
      "text", "tool_card", "progress", "error", "end",
    ];
    const hostRendering = new Set(host.rendering);
    const frameTypes = agentFrameTypes.filter((ft) => hostRendering.has(ft));

    const hostLevel = host.conformanceLevel ?? "basic";
    const agentLevel = this.agentCard.conformance ?? "basic";
    const conformanceLevel = minConformance(hostLevel, agentLevel);

    return {
      frameTypes,
      conformanceLevel,
      stateSync: (host.stateSync ?? false) && (this.agentCard.capabilities.stateObservation ?? false),
      orchestration: (host.orchestration ?? false) && (this.agentCard.capabilities.uiOrchestration ?? false),
      presence: this.agentCard.capabilities.presence ?? false,
    };
  }

  private writeSSE(sessionId: string, event: string, data: H2AMessage): void {
    const writer = this.sseWriters.get(sessionId);
    if (!writer) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    writer.write(payload);
  }
}

// ── Helpers ──

function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const CONFORMANCE_ORDER: ConformanceLevel[] = ["basic", "standard", "full"];

function minConformance(a: ConformanceLevel, b: ConformanceLevel): ConformanceLevel {
  const ia = CONFORMANCE_ORDER.indexOf(a);
  const ib = CONFORMANCE_ORDER.indexOf(b);
  return CONFORMANCE_ORDER[Math.min(ia, ib)];
}

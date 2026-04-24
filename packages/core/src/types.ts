// ── Protocol Version ──

export const H2A_VERSION = "0.1" as const;

// ── Presence States ──

export type PresenceState = "rest" | "attentive" | "conversing" | "orchestrating";

export const PRESENCE_STATES: readonly PresenceState[] = [
  "rest",
  "attentive",
  "conversing",
  "orchestrating",
] as const;

// ── Frame Types ──

export type FrameType =
  | "text"
  | "tool_card"
  | "confirmation"
  | "progress"
  | "state_delta"
  | "toast"
  | "artifact"
  | "component"
  | "error"
  | "end";

// ── Signal Types ──

export type SignalType =
  | "message"
  | "confirm"
  | "deny"
  | "interrupt"
  | "redirect"
  | "context_change"
  | "feedback"
  | "session_switch";

// ── Conformance Levels ──

export type ConformanceLevel = "basic" | "standard" | "full";

// ── User Activity ──

export type UserActivity = "typing" | "idle" | "scrolling" | "selecting" | "navigating";

// ── Toast Severity ──

export type ToastSeverity = "info" | "success" | "warning" | "error";

// ── Error Codes ──

export type H2AErrorCode =
  | "SESSION_EXPIRED"
  | "RATE_LIMITED"
  | "ORCHESTRATION_DENIED"
  | "STATE_SYNC_ERROR"
  | "AGENT_OVERLOADED"
  | "UNSUPPORTED_FRAME"
  | "AUTHENTICATION_REQUIRED"
  | "INTERNAL_ERROR";

// ── StateDelta Operations ──

export type StateDeltaOp =
  | "navigate"
  | "fill"
  | "click"
  | "scroll"
  | "focus"
  | "blur"
  | "select"
  | "toggle"
  | "wait"
  | "notify";

export type StateDeltaMode = "atomic" | "sequential" | "best_effort";

// ── Core Message Interfaces ──

export interface AgentCard {
  h2a: string;
  name: string;
  description?: string;
  domain?: string[];
  capabilities: AgentCapabilities;
  conformance?: ConformanceLevel;
  presence?: PresenceConfig;
  frameTypes?: string[];
  stateRequirements?: StateRequirements;
  endpoint: { h2a: string; agentCard?: string };
  authentication?: { schemes: string[] };
}

export interface AgentCapabilities {
  streaming: boolean;
  presence?: boolean;
  stateObservation?: boolean;
  uiOrchestration?: boolean;
  multimodal?: ("text" | "audio" | "image" | "video")[];
  interruptible?: boolean;
}

export interface PresenceConfig {
  states: string[];
  defaultState?: string;
  custom?: Record<string, { parent: PresenceState; description: string }>;
}

export interface StateRequirements {
  required?: string[];
  optional?: string[];
  neverSend?: string[];
  projections?: Record<string, string[]>;
  maxSnapshotSize?: number;
}

// ── Session Messages ──

export interface SessionOpen {
  type: "session.open";
  sessionId?: string;
  resumeFrom?: string;
  hostCapabilities: HostCapabilities;
  locale?: string;
  timezone?: string;
}

export interface SessionAck {
  type: "session.ack";
  sessionId: string;
  negotiatedCapabilities: NegotiatedCapabilities;
}

export interface SessionResume {
  type: "session.resume";
  sessionId: string;
  lastReceivedSequence: number;
}

export interface HostCapabilities {
  rendering: string[];
  conformanceLevel?: ConformanceLevel;
  stateSync?: boolean;
  orchestration?: boolean;
  accessibility?: {
    screenReader?: boolean;
    reducedMotion?: boolean;
    voiceOnly?: boolean;
  };
}

export interface NegotiatedCapabilities {
  frameTypes: string[];
  conformanceLevel: ConformanceLevel;
  stateSync?: boolean;
  orchestration?: boolean;
  presence?: boolean;
}

// ── State Messages ──

export interface StateSnapshot {
  type: "state.snapshot";
  timestamp: string;
  page?: { route: string; title?: string; section?: string };
  data?: Record<string, unknown>;
  user?: { activity?: UserActivity; idleSeconds?: number; focusedElement?: string };
}

export interface StateDiff {
  type: "state.diff";
  timestamp: string;
  changes: JsonPatchOperation[];
}

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

// ── Agent Frame ──

export interface AgentFrame {
  type: "agent.frame";
  id: string;
  sequence?: number;
  frameType: FrameType | string;
  content: unknown;
  streaming?: boolean;
  final?: boolean;
  lang?: string;
  fallbackText?: string;
  metadata?: FrameMetadata;
}

export interface FrameMetadata {
  interruptible?: boolean;
  revertible?: boolean;
  revertOperations?: StateDeltaOperation[];
  presenceHint?: string;
  narration?: string;
}

export interface StateDeltaOperation {
  op: StateDeltaOp;
  target: string;
  value?: unknown;
  timeout?: number;
}

// ── Frame Content Types ──

export interface TextContent {
  text: string;
  format?: "plain" | "markdown" | "html";
}

export interface ToolCardContent {
  tool: string;
  input?: Record<string, unknown>;
  output?: unknown;
  status: "running" | "completed" | "failed" | "cancelled";
  duration?: number;
}

export interface ConfirmationContent {
  action: string;
  description: string;
  tier?: "autonomous" | "confirmable" | "restricted";
  options: ConfirmationOption[];
  timeout?: number;
}

export interface ConfirmationOption {
  id: string;
  label: string;
  default?: boolean;
  destructive?: boolean;
}

export interface ProgressContent {
  task: string;
  percent?: number;
  message?: string;
  estimatedRemaining?: number;
}

export interface ToastContent {
  message: string;
  severity?: ToastSeverity;
  duration?: number;
  action?: { label: string; signalType: string };
}

export interface ArtifactContent {
  mimeType: string;
  name: string;
  data?: string;
  uri?: string;
  size?: number;
}

export interface ErrorContent {
  code: H2AErrorCode;
  message: string;
  retryAfter?: number;
  severity?: "info" | "warning" | "error" | "fatal";
}

export interface StateDeltaContent {
  mode?: StateDeltaMode;
  operations: StateDeltaOperation[];
  onFailure?: "rollback" | "continue" | "stop";
}

// ── User Signal ──

export interface UserSignal {
  type: "user.signal";
  signalType: SignalType;
  content?: unknown;
  context?: {
    referencedFrames?: string[];
    attachments?: Attachment[];
  };
}

export interface Attachment {
  mimeType: string;
  name: string;
  data?: string;
  uri?: string;
}

// ── Presence Update ──

export interface PresenceUpdate {
  type: "presence.update";
  state: PresenceState | string;
  confidence?: number;
  trigger?: string;
  suggestedAction?: string;
}

// ── Union Type ──

export type H2AMessage =
  | SessionOpen
  | SessionAck
  | SessionResume
  | StateSnapshot
  | StateDiff
  | AgentFrame
  | UserSignal
  | PresenceUpdate;

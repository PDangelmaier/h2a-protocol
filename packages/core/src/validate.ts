import type {
  AgentFrame,
  AgentCard,
  H2AMessage,
  PresenceUpdate,
  SessionAck,
  SessionOpen,
  StateSnapshot,
  UserSignal,
  StateDeltaOperation,
  ConformanceLevel,
} from "./types.js";
import { PRESENCE_STATES } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function fail(...errors: string[]): ValidationResult {
  return { valid: false, errors };
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

export function validateMessage(message: unknown): ValidationResult {
  if (!message || typeof message !== "object") return fail("Message must be an object");
  const msg = message as Record<string, unknown>;

  if (!msg.type || typeof msg.type !== "string") return fail("Missing or invalid 'type' field");

  switch (msg.type) {
    case "session.open":
      return validateSessionOpen(msg as unknown as SessionOpen);
    case "session.ack":
      return validateSessionAck(msg as unknown as SessionAck);
    case "state.snapshot":
      return validateStateSnapshot(msg as unknown as StateSnapshot);
    case "agent.frame":
      return validateAgentFrame(msg as unknown as AgentFrame);
    case "user.signal":
      return validateUserSignal(msg as unknown as UserSignal);
    case "presence.update":
      return validatePresenceUpdate(msg as unknown as PresenceUpdate);
    default:
      return fail(`Unknown message type: ${msg.type}`);
  }
}

export function validateSessionOpen(msg: SessionOpen): ValidationResult {
  const errors: string[] = [];
  if (msg.type !== "session.open") errors.push("type must be 'session.open'");
  if (!msg.hostCapabilities) errors.push("hostCapabilities is required");
  if (msg.hostCapabilities && !Array.isArray(msg.hostCapabilities.rendering)) {
    errors.push("hostCapabilities.rendering must be an array");
  }
  return errors.length ? fail(...errors) : ok();
}

export function validateSessionAck(msg: SessionAck): ValidationResult {
  const errors: string[] = [];
  if (msg.type !== "session.ack") errors.push("type must be 'session.ack'");
  if (!msg.sessionId || typeof msg.sessionId !== "string") errors.push("sessionId is required");
  if (!msg.negotiatedCapabilities) errors.push("negotiatedCapabilities is required");
  return errors.length ? fail(...errors) : ok();
}

export function validateStateSnapshot(msg: StateSnapshot): ValidationResult {
  const errors: string[] = [];
  if (msg.type !== "state.snapshot") errors.push("type must be 'state.snapshot'");
  if (!msg.timestamp) errors.push("timestamp is required");
  return errors.length ? fail(...errors) : ok();
}

export function validateAgentFrame(frame: AgentFrame): ValidationResult {
  const errors: string[] = [];
  if (frame.type !== "agent.frame") errors.push("type must be 'agent.frame'");
  if (!frame.id || typeof frame.id !== "string") errors.push("id is required");
  if (!frame.frameType) errors.push("frameType is required");

  if (frame.frameType === "state_delta") {
    if (frame.metadata?.revertible && !frame.metadata.revertOperations?.length) {
      errors.push("revertible state_delta MUST include revertOperations");
    }
  }

  const knownTypes = [
    "text", "tool_card", "confirmation", "progress", "state_delta",
    "toast", "artifact", "component", "error", "end",
  ];

  if (!knownTypes.includes(frame.frameType) && !frame.frameType.startsWith("x-")) {
    if (!frame.fallbackText) {
      errors.push(`Unknown frameType '${frame.frameType}' without fallbackText`);
    }
  }

  return errors.length ? fail(...errors) : ok();
}

export function validateUserSignal(signal: UserSignal): ValidationResult {
  const errors: string[] = [];
  if (signal.type !== "user.signal") errors.push("type must be 'user.signal'");
  if (!signal.signalType) errors.push("signalType is required");

  const knownSignals = [
    "message", "confirm", "deny", "interrupt", "redirect",
    "context_change", "feedback", "session_switch",
  ];

  if (!knownSignals.includes(signal.signalType)) {
    errors.push(`Unknown signalType: ${signal.signalType}`);
  }

  return errors.length ? fail(...errors) : ok();
}

export function validatePresenceUpdate(update: PresenceUpdate): ValidationResult {
  const errors: string[] = [];
  if (update.type !== "presence.update") errors.push("type must be 'presence.update'");
  if (!update.state) errors.push("state is required");
  if (update.confidence !== undefined && (update.confidence < 0 || update.confidence > 1)) {
    errors.push("confidence must be between 0 and 1");
  }
  return errors.length ? fail(...errors) : ok();
}

export function validateAgentCard(card: AgentCard): ValidationResult {
  const errors: string[] = [];
  if (!card.h2a) errors.push("h2a version is required");
  if (!card.name) errors.push("name is required");
  if (!card.capabilities) errors.push("capabilities is required");
  if (card.capabilities && typeof card.capabilities.streaming !== "boolean") {
    errors.push("capabilities.streaming is required and must be boolean");
  }
  if (!card.endpoint?.h2a) errors.push("endpoint.h2a is required");
  return errors.length ? fail(...errors) : ok();
}

export interface OrchestrationPolicy {
  allowedOperations?: string[];
  deniedOperations?: string[];
  navigationScope?: "same-origin" | "same-app" | "allowlisted" | "any";
  navigationPathDenylist?: string[];
  navigationPathAllowlist?: string[];
  rateLimits?: {
    maxOperationsPerFrame?: number;
    maxFramesPerMinute?: number;
  };
}

export function validateStateDelta(
  operations: StateDeltaOperation[],
  policy: OrchestrationPolicy,
): ValidationResult {
  const errors: string[] = [];
  const maxOps = policy.rateLimits?.maxOperationsPerFrame ?? 20;

  if (operations.length > maxOps) {
    errors.push(`Too many operations: ${operations.length} > ${maxOps}`);
  }

  for (const op of operations) {
    if (policy.deniedOperations?.includes(op.op)) {
      errors.push(`Operation '${op.op}' is denied by policy`);
    }

    if (policy.allowedOperations && !policy.allowedOperations.includes(op.op)) {
      errors.push(`Operation '${op.op}' is not in allowedOperations`);
    }

    if (op.op === "navigate" && typeof op.target === "string") {
      if (policy.navigationPathDenylist?.some((p) => op.target.startsWith(p))) {
        errors.push(`Navigation to '${op.target}' is denied by path denylist`);
      }

      if (policy.navigationPathAllowlist) {
        const allowed = policy.navigationPathAllowlist.some(
          (p) => p.endsWith("*") ? op.target.startsWith(p.slice(0, -1)) : op.target === p,
        );
        if (!allowed) {
          errors.push(`Navigation to '${op.target}' is not in path allowlist`);
        }
      }
    }
  }

  return errors.length ? fail(...errors) : ok();
}

/**
 * Converts an H2A SSE stream into a Vercel AI SDK-compatible ReadableStream.
 *
 * Vercel AI SDK's useChat expects a stream of text deltas in a specific format.
 * This adapter reads H2A agent.frame events and translates text frames into
 * the format useChat can consume, while forwarding non-text frames as data messages.
 */

import type { AgentFrame, PresenceUpdate, SessionAck } from "@h2a/core";

export interface H2AStreamOptions {
  endpoint: string;
  sessionId?: string;
  headers?: Record<string, string>;
  locale?: string;
  onPresence?: (update: PresenceUpdate) => void;
  onSessionAck?: (ack: SessionAck) => void;
  onNonTextFrame?: (frame: AgentFrame) => void;
}

export function H2AStream(options: H2AStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const response = await fetch(`${options.endpoint}/h2a/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        body: JSON.stringify({
          type: "session.open",
          sessionId: options.sessionId,
          hostCapabilities: { rendering: ["text", "tool_card", "progress", "error", "end"] },
          locale: options.locale ?? "en-US",
        }),
      });

      if (!response.ok || !response.body) {
        controller.error(new Error(`H2A connection failed: ${response.status}`));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const pump = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          if (!block.trim()) continue;
          processSSEBlock(block, controller, encoder, options);
        }

        await pump();
      };

      pump().catch((err) => controller.error(err));
    },
  });
}

function processSSEBlock(
  block: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  options: H2AStreamOptions,
): void {
  let eventType = "message";
  let data = "";

  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) eventType = line.slice(7);
    else if (line.startsWith("data: ")) data += line.slice(6);
  }

  if (!data) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data);
  } catch {
    return;
  }

  if (eventType === "session.ack" || parsed.type === "session.ack") {
    options.onSessionAck?.(parsed as unknown as SessionAck);
    return;
  }

  if (eventType === "presence.update" || parsed.type === "presence.update") {
    options.onPresence?.(parsed as unknown as PresenceUpdate);
    return;
  }

  if (eventType === "agent.frame" || parsed.type === "agent.frame") {
    const frame = parsed as unknown as AgentFrame;

    if (frame.frameType === "text") {
      const text = typeof frame.content === "string"
        ? frame.content
        : (frame.content as { text?: string })?.text ?? "";
      controller.enqueue(encoder.encode(text));
    } else if (frame.frameType === "end") {
      controller.close();
    } else {
      options.onNonTextFrame?.(frame);
      const dataLine = `2:${JSON.stringify({ type: frame.frameType, content: frame.content })}\n`;
      controller.enqueue(encoder.encode(dataLine));
    }
  }
}

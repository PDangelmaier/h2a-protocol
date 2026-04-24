/**
 * Bridges LangGraph streaming events to H2A frames.
 *
 * LangGraph emits events like:
 *   { event: "on_llm_stream", data: { chunk: { content: "..." } } }
 *   { event: "on_tool_start", data: { name: "search", input: {...} } }
 *   { event: "on_tool_end", data: { output: "..." } }
 *
 * This bridge translates them into H2A AgentFrames sent via H2AServer.
 */

import type { H2AServer, H2ASession } from "@h2a/core";

export interface LangGraphEvent {
  event: string;
  data: Record<string, unknown>;
  name?: string;
  run_id?: string;
}

export interface H2ALangGraphOptions {
  h2a: H2AServer;
  sessionId: string;
  toolFrameEnabled?: boolean;
  progressEnabled?: boolean;
}

export class H2ALangGraphBridge {
  private h2a: H2AServer;
  private sessionId: string;
  private toolFrameEnabled: boolean;
  private progressEnabled: boolean;
  private frameIdCounter = 0;

  constructor(options: H2ALangGraphOptions) {
    this.h2a = options.h2a;
    this.sessionId = options.sessionId;
    this.toolFrameEnabled = options.toolFrameEnabled ?? true;
    this.progressEnabled = options.progressEnabled ?? true;
  }

  private nextId(): string {
    return `lg_${++this.frameIdCounter}`;
  }

  processEvent(event: LangGraphEvent): void {
    switch (event.event) {
      case "on_llm_stream":
        this.handleLLMStream(event);
        break;
      case "on_llm_end":
        this.handleLLMEnd(event);
        break;
      case "on_tool_start":
        if (this.toolFrameEnabled) this.handleToolStart(event);
        break;
      case "on_tool_end":
        if (this.toolFrameEnabled) this.handleToolEnd(event);
        break;
      case "on_chain_start":
        if (this.progressEnabled) this.handleChainStart(event);
        break;
      case "on_chain_end":
        this.handleChainEnd(event);
        break;
    }
  }

  async processStream(events: AsyncIterable<LangGraphEvent>): Promise<void> {
    this.h2a.sendPresence(this.sessionId, "conversing", "langgraph_stream_start");

    for await (const event of events) {
      this.processEvent(event);
    }

    this.sendEnd("complete");
    this.h2a.sendPresence(this.sessionId, "rest", "langgraph_stream_end");
  }

  private handleLLMStream(event: LangGraphEvent): void {
    const chunk = event.data.chunk as Record<string, unknown> | undefined;
    const content = chunk?.content;
    if (typeof content !== "string" || !content) return;

    this.h2a.sendFrame(this.sessionId, {
      id: this.nextId(),
      frameType: "text",
      content,
      streaming: true,
      final: false,
    });
  }

  private handleLLMEnd(_event: LangGraphEvent): void {
    this.h2a.sendFrame(this.sessionId, {
      id: this.nextId(),
      frameType: "text",
      content: "",
      streaming: true,
      final: true,
    });
  }

  private handleToolStart(event: LangGraphEvent): void {
    const toolName = event.name ?? (event.data.name as string) ?? "unknown";
    const input = event.data.input ?? {};

    this.h2a.sendPresence(this.sessionId, "orchestrating", `tool:${toolName}`);
    this.h2a.sendFrame(this.sessionId, {
      id: this.nextId(),
      frameType: "tool_card",
      content: {
        tool: toolName,
        input,
        status: "running",
      },
    });
  }

  private handleToolEnd(event: LangGraphEvent): void {
    const toolName = event.name ?? (event.data.name as string) ?? "unknown";
    const output = event.data.output;

    this.h2a.sendFrame(this.sessionId, {
      id: this.nextId(),
      frameType: "tool_card",
      content: {
        tool: toolName,
        output,
        status: "completed",
      },
    });

    this.h2a.sendPresence(this.sessionId, "conversing", `tool_complete:${toolName}`);
  }

  private handleChainStart(event: LangGraphEvent): void {
    const name = event.name ?? "processing";

    this.h2a.sendFrame(this.sessionId, {
      id: this.nextId(),
      frameType: "progress",
      content: {
        task: name,
        message: `Running ${name}...`,
      },
    });
  }

  private handleChainEnd(_event: LangGraphEvent): void {
    // Chain completion is implicit — next frame continues the flow
  }

  sendEnd(reason: string): void {
    this.h2a.sendFrame(this.sessionId, {
      id: this.nextId(),
      frameType: "end",
      content: { reason },
      final: true,
    });
  }

  sendError(message: string, code = "INTERNAL_ERROR"): void {
    this.h2a.sendFrame(this.sessionId, {
      id: this.nextId(),
      frameType: "error",
      content: { code, message },
      final: true,
    });
  }
}

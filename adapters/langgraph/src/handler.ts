/**
 * Creates a Node.js HTTP handler that serves a LangGraph agent via H2A.
 *
 * Usage:
 *   import { createH2AHandler } from "@h2a/langgraph";
 *   const handler = createH2AHandler({ invoke: myGraph.stream.bind(myGraph) });
 *   http.createServer(handler).listen(8100);
 *
 * Or with Express:
 *   app.use("/", createH2AHandler({ invoke: myGraph.stream.bind(myGraph) }));
 */

import { H2AServer, type UserSignal, type SessionOpen, type SessionResume } from "@h2a/core";
import { H2ALangGraphBridge, type LangGraphEvent } from "./bridge.js";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface H2AHandlerOptions {
  invoke: (input: Record<string, unknown>) => AsyncIterable<LangGraphEvent>;
  agentName?: string;
  agentDescription?: string;
  domain?: string[];
  conformance?: "basic" | "standard" | "full";
  maxSessions?: number;
}

export function createH2AHandler(options: H2AHandlerOptions) {
  const h2a = new H2AServer({
    agentCard: {
      h2a: "0.1",
      name: options.agentName ?? "LangGraph Agent",
      description: options.agentDescription,
      domain: options.domain,
      capabilities: {
        streaming: true,
        presence: true,
        stateObservation: false,
        uiOrchestration: false,
        interruptible: true,
      },
      conformance: options.conformance ?? "standard",
      frameTypes: ["text", "tool_card", "progress", "error", "end"],
      endpoint: { h2a: "/h2a" },
    },
    onSignal: async (session, signal) => {
      if (signal.signalType === "message") {
        const content = signal.content as Record<string, unknown>;
        const text = typeof content === "string" ? content : (content?.text as string) ?? "";

        const bridge = new H2ALangGraphBridge({
          h2a,
          sessionId: session.id,
        });

        try {
          const events = options.invoke({ messages: [{ role: "user", content: text }] });
          await bridge.processStream(events);
        } catch (err) {
          bridge.sendError(err instanceof Error ? err.message : "Unknown error");
        }
      }

      if (signal.signalType === "interrupt") {
        // LangGraph doesn't have native interrupt — send end frame
        h2a.sendFrame(session.id, {
          id: `int_${Date.now()}`,
          frameType: "text",
          content: " [interrupted]",
          streaming: true,
          final: true,
        });
        h2a.sendFrame(session.id, {
          id: `end_${Date.now()}`,
          frameType: "end",
          content: { reason: "interrupted" },
          final: true,
        });
      }
    },
    maxSessions: options.maxSessions ?? 50,
  });

  return async function handler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    if (url.pathname === "/.well-known/h2a-agent.json" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders() });
      res.end(JSON.stringify(h2a.card));
      return;
    }

    if (url.pathname === "/h2a/session" && req.method === "POST") {
      const body = await readBody(req);
      const session = h2a.handleSessionRequest(
        body as SessionOpen | SessionResume,
        { write: (chunk: string) => res.write(chunk), end: () => res.end() },
      );

      if (!session) {
        res.writeHead(503, corsHeaders());
        res.end(JSON.stringify({ error: "No sessions available" }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-H2A-Session": session.id,
        ...corsHeaders(),
      });
      return;
    }

    if (url.pathname === "/h2a/signal" && req.method === "POST") {
      const body = await readBody(req);
      const sessionId = req.headers["x-h2a-session"] as string;
      const ok = await h2a.handleSignal(sessionId, body as unknown as UserSignal);

      res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json", ...corsHeaders() });
      res.end(JSON.stringify({ ok }));
      return;
    }

    if (url.pathname === "/h2a/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders() });
      res.end(JSON.stringify({ status: "ok", sessions: h2a.sessionCount }));
      return;
    }

    res.writeHead(404, corsHeaders());
    res.end("Not found");
  };
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-H2A-Session",
    "Access-Control-Expose-Headers": "X-H2A-Session",
  };
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

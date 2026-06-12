import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  H2AServer,
  type H2ASession,
  type AgentCard,
  type UserSignal,
} from "@h2a/core";
import { ALL_SCENARIOS, getScenario, type FrameSender, type Scenario } from "./scenarios.js";

export interface MockAgentOptions {
  port?: number;
  scenario?: Scenario;
  cors?: boolean;
}

const AGENT_CARD: AgentCard = {
  h2a: "0.1",
  name: "H2A Mock Agent",
  description: "Deterministic mock agent for protocol testing",
  capabilities: {
    streaming: true,
    presence: true,
    stateObservation: false,
    uiOrchestration: true,
    interruptible: true,
  },
  conformance: "standard",
  frameTypes: ["text", "tool_card", "confirmation", "progress", "toast", "error", "end"],
  endpoint: { h2a: "/h2a/session" },
};

export function createMockAgent(options: MockAgentOptions = {}) {
  const { port = 8100, scenario: defaultScenario = "echo", cors = true } = options;

  const h2a = new H2AServer({
    agentCard: AGENT_CARD,
    onSignal: async (session, signal) => {
      if (signal.signalType !== "message") return;

      const text = (signal.content as { text?: string })?.text ?? "";
      const scenarioName = detectScenario(text) ?? defaultScenario;
      const handler = getScenario(scenarioName);
      if (!handler) return;

      const sender = createSender(h2a, session);
      await handler.handle(session, text, sender);
    },
    idleTimeoutMs: 60_000,
  });

  const httpServer = createServer(async (req, res) => {
    if (cors) setCors(res);
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    if (url.pathname === "/.well-known/h2a.json" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(AGENT_CARD));
      return;
    }

    if (url.pathname === "/h2a/session" && req.method === "POST") {
      const body = await readBody(req) as import("@h2a/core").SessionOpen | import("@h2a/core").SessionResume;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const writable = { write: (c: string) => res.write(c), end: () => res.end() };
      const session = h2a.handleSessionRequest(body, writable);
      if (!session) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: "Max sessions reached" }));
      }
      return;
    }

    if (url.pathname === "/h2a/signal" && req.method === "POST") {
      const signal = await readBody(req) as unknown as UserSignal;
      const sessionId = req.headers["x-h2a-session"] as string;
      if (!sessionId) { res.writeHead(400); res.end("Missing X-H2A-Session"); return; }

      const handled = await h2a.handleSignal(sessionId, signal);
      res.writeHead(handled ? 200 : 404);
      res.end(JSON.stringify({ ok: handled }));
      return;
    }

    if (url.pathname === "/h2a/scenarios" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(ALL_SCENARIOS.map((s) => ({ name: s.name, description: s.description }))));
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  return {
    server: httpServer,
    h2a,
    start: () => new Promise<void>((resolve) => httpServer.listen(port, resolve)),
    stop: () => new Promise<void>((resolve, reject) => {
      h2a.destroy();
      httpServer.close((err) => (err ? reject(err) : resolve()));
    }),
    port,
  };
}

function createSender(h2a: H2AServer, session: H2ASession): FrameSender {
  const sid = session.id;
  return {
    text: (id, content, opts) => h2a.sendFrame(sid, { id, frameType: "text", content: { text: content, format: "plain" }, streaming: opts?.streaming, final: opts?.final }),
    progress: (id, task, percent, message) => h2a.sendFrame(sid, { id, frameType: "progress", content: { task, percent, message } }),
    toolCard: (id, tool, status, input, output) => h2a.sendFrame(sid, { id, frameType: "tool_card", content: { tool, status, input, output } }),
    confirmation: (id, action, description, options) => h2a.sendFrame(sid, { id, frameType: "confirmation", content: { action, description, options } }),
    toast: (id, message, severity) => h2a.sendFrame(sid, { id, frameType: "toast", content: { message, severity: severity ?? "info" } }),
    error: (id, code, message) => h2a.sendFrame(sid, { id, frameType: "error", content: { code, message } }),
    end: (id) => h2a.sendFrame(sid, { id, frameType: "end", content: {} }),
    presence: (state, trigger) => h2a.sendPresence(sid, state, trigger),
  };
}

function detectScenario(text: string): Scenario | null {
  const lower = text.toLowerCase();
  if (lower.startsWith("/stream") || lower.includes("slow")) return "slow-stream";
  if (lower.startsWith("/orchestrate") || lower.includes("orchestrat")) return "orchestrate";
  if (lower.startsWith("/error") || lower.includes("fail")) return "error";
  if (lower.startsWith("/config") || lower.includes("mercedes") || lower.includes("eqs") || lower.includes("konfig")) return "configurator";
  return null;
}

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-H2A-Session");
  res.setHeader("Access-Control-Expose-Headers", "X-H2A-Session");
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

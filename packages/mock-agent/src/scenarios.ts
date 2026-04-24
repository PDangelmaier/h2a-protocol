import type { H2ASession } from "@h2a/core";

export type Scenario = "echo" | "slow-stream" | "orchestrate" | "error";

export interface ScenarioHandler {
  name: Scenario;
  description: string;
  handle(session: H2ASession, text: string, send: FrameSender): Promise<void>;
}

export interface FrameSender {
  text(id: string, content: string, options?: { streaming?: boolean; final?: boolean }): void;
  progress(id: string, task: string, percent: number, message?: string): void;
  toolCard(id: string, tool: string, status: "running" | "completed" | "failed", input?: Record<string, unknown>, output?: unknown): void;
  confirmation(id: string, action: string, description: string, options: { id: string; label: string }[]): void;
  toast(id: string, message: string, severity?: "info" | "success" | "warning" | "error"): void;
  error(id: string, code: string, message: string): void;
  end(id: string): void;
  presence(state: "rest" | "attentive" | "conversing" | "orchestrating", trigger: string): void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const echoScenario: ScenarioHandler = {
  name: "echo",
  description: "Echoes user message back immediately",
  async handle(_session, text, send) {
    const id = `echo-${Date.now()}`;
    send.presence("conversing", "user_message");
    send.text(id, `Echo: ${text}`, { final: true });
    send.end(id);
    send.presence("rest", "response_complete");
  },
};

export const slowStreamScenario: ScenarioHandler = {
  name: "slow-stream",
  description: "Streams response word-by-word with 100ms delay",
  async handle(_session, text, send) {
    const id = `stream-${Date.now()}`;
    send.presence("conversing", "user_message");

    const words = `I received your message: "${text}". Let me think about this carefully and provide a detailed response.`.split(" ");

    for (let i = 0; i < words.length; i++) {
      const chunk = (i > 0 ? " " : "") + words[i];
      send.text(id, chunk, { streaming: true, final: i === words.length - 1 });
      await sleep(100);
    }

    send.end(id);
    send.presence("rest", "response_complete");
  },
};

export const orchestrateScenario: ScenarioHandler = {
  name: "orchestrate",
  description: "Simulates multi-step orchestration with tool calls and confirmation",
  async handle(_session, text, send) {
    const baseId = `orch-${Date.now()}`;
    send.presence("conversing", "user_message");

    send.text(`${baseId}-ack`, `Processing your request: "${text}"`, { final: true });
    await sleep(200);

    send.presence("orchestrating", "tool_execution");
    const toolId = `${baseId}-tool`;
    send.toolCard(toolId, "search_knowledge_base", "running", { query: text });
    send.progress(`${baseId}-prog`, "Searching knowledge base", 30, "Querying...");
    await sleep(500);
    send.progress(`${baseId}-prog`, "Searching knowledge base", 80, "Processing results...");
    await sleep(300);
    send.toolCard(toolId, "search_knowledge_base", "completed", { query: text }, { results: 3 });
    send.progress(`${baseId}-prog`, "Searching knowledge base", 100, "Done");

    send.confirmation(`${baseId}-confirm`, "apply_changes", "Apply the suggested changes to the document?", [
      { id: "apply", label: "Apply" },
      { id: "cancel", label: "Cancel" },
    ]);
    await sleep(200);

    send.presence("conversing", "confirmation_sent");
    send.text(`${baseId}-result`, "Based on my analysis, I found 3 relevant results. Awaiting your confirmation to proceed.", { final: true });
    send.toast(`${baseId}-toast`, "Analysis complete", "success");
    send.end(`${baseId}-result`);
    send.presence("rest", "response_complete");
  },
};

export const errorScenario: ScenarioHandler = {
  name: "error",
  description: "Simulates various error conditions",
  async handle(_session, _text, send) {
    const id = `err-${Date.now()}`;
    send.presence("conversing", "user_message");
    send.text(`${id}-partial`, "Let me try to process—", { streaming: true });
    await sleep(300);
    send.error(id, "AGENT_OVERLOADED", "The agent is temporarily overloaded. Please retry in a moment.");
    send.presence("rest", "error_recovery");
  },
};

export const ALL_SCENARIOS: ScenarioHandler[] = [
  echoScenario,
  slowStreamScenario,
  orchestrateScenario,
  errorScenario,
];

export function getScenario(name: string): ScenarioHandler | undefined {
  return ALL_SCENARIOS.find((s) => s.name === name);
}

import type { H2ASession } from "@h2a/core";

export type Scenario = "echo" | "slow-stream" | "orchestrate" | "error" | "configurator";

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

export const configuratorScenario: ScenarioHandler = {
  name: "configurator" as Scenario,
  description: "Mercedes-Benz UCP car configurator assistant — demonstrates commerce use case",
  async handle(_session, text, send) {
    const baseId = `cfg-${Date.now()}`;
    send.presence("conversing", "user_message");

    const words = `Willkommen beim Mercedes-Benz Konfigurator. Ich analysiere Ihre Anfrage...`.split(" ");
    for (let i = 0; i < words.length; i++) {
      send.text(`${baseId}-greet`, (i > 0 ? " " : "") + words[i], { streaming: true, final: i === words.length - 1 });
      await sleep(80);
    }
    await sleep(300);

    send.presence("orchestrating", "configuration_lookup");
    send.toolCard(`${baseId}-lookup`, "configurator.lookup_model", "running", { query: text, market: "DE" });
    send.progress(`${baseId}-prog`, "Modellsuche", 25, "Verfuegbare Modelle pruefen...");
    await sleep(400);
    send.progress(`${baseId}-prog`, "Modellsuche", 60, "Ausstattungspakete laden...");
    await sleep(400);
    send.toolCard(`${baseId}-lookup`, "configurator.lookup_model", "completed", { query: text }, {
      model: "EQS 450+", line: "AMG Line", price: "ab 112.907 EUR",
    });
    send.progress(`${baseId}-prog`, "Modellsuche", 100, "Fertig");
    await sleep(200);

    send.confirmation(`${baseId}-confirm`, "configure_vehicle", "Soll ich eine EQS 450+ Konfiguration in AMG Line fuer Sie erstellen?", [
      { id: "yes", label: "Konfiguration starten" },
      { id: "compare", label: "Modelle vergleichen" },
      { id: "no", label: "Abbrechen" },
    ]);
    await sleep(200);

    send.presence("conversing", "awaiting_confirmation");
    const result = `Fuer den **EQS 450+** in **AMG Line** empfehle ich folgende Highlights:\n\n`
      + `- MBUX Hyperscreen\n- Hinterachslenkung 10°\n- Burmester 4D Surround\n- Fahrassistenz-Paket Plus\n\n`
      + `Grundpreis: **112.907 EUR** — mit diesen Optionen ca. **128.400 EUR**.`;
    const resultWords = result.split(" ");
    for (let i = 0; i < resultWords.length; i++) {
      send.text(`${baseId}-result`, (i > 0 ? " " : "") + resultWords[i], { streaming: true, final: i === resultWords.length - 1 });
      await sleep(60);
    }

    send.toast(`${baseId}-toast`, "Konfiguration bereit", "success");
    send.end(`${baseId}-end`);
    send.presence("rest", "response_complete");
  },
};

export const ALL_SCENARIOS: ScenarioHandler[] = [
  echoScenario,
  slowStreamScenario,
  orchestrateScenario,
  errorScenario,
  configuratorScenario,
];

export function getScenario(name: string): ScenarioHandler | undefined {
  return ALL_SCENARIOS.find((s) => s.name === name);
}

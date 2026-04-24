#!/usr/bin/env node
import { createMockAgent, type MockAgentOptions } from "./server.js";

const args = process.argv.slice(2);
const options: MockAgentOptions = { port: 8100, scenario: "echo", cors: true };

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" || args[i] === "-p") options.port = parseInt(args[++i], 10);
  if (args[i] === "--scenario" || args[i] === "-s") options.scenario = args[++i] as MockAgentOptions["scenario"];
  if (args[i] === "--no-cors") options.cors = false;
}

const agent = createMockAgent(options);

agent.start().then(() => {
  console.log(`\n  H2A Mock Agent running on http://localhost:${agent.port}`);
  console.log(`  Default scenario: ${options.scenario}`);
  console.log(`  Agent Card: http://localhost:${agent.port}/.well-known/h2a.json`);
  console.log(`  Scenarios: http://localhost:${agent.port}/h2a/scenarios\n`);
});

process.on("SIGINT", () => { agent.stop().then(() => process.exit(0)); });
process.on("SIGTERM", () => { agent.stop().then(() => process.exit(0)); });

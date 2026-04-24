#!/usr/bin/env node

import type { ConformanceLevel } from "@h2a/core";
import { runConformanceSuite, formatSuiteResult } from "./runner.js";

const args = process.argv.slice(2);

function usage(): never {
  console.log(`
Usage: h2a-test [options]

  --endpoint <url>   Agent endpoint (default: http://localhost:8100)
  --level <level>    Conformance level: basic | standard | full (default: basic)
  --timeout <ms>     Per-test timeout in ms (default: 10000)
  --json             Output JSON instead of text
  --help             Show this help

Examples:
  h2a-test --endpoint http://localhost:8100 --level standard
  h2a-test --level full --json
`);
  process.exit(0);
}

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

if (args.includes("--help") || args.includes("-h")) usage();

const endpoint = getArg("--endpoint", "http://localhost:8100");
const level = getArg("--level", "basic") as ConformanceLevel;
const timeout = parseInt(getArg("--timeout", "10000"), 10);
const jsonOutput = args.includes("--json");

if (!["basic", "standard", "full"].includes(level)) {
  console.error(`Invalid level: ${level}. Must be basic, standard, or full.`);
  process.exit(1);
}

console.log(`H2A Conformance Test Suite`);
console.log(`Target: ${endpoint}`);
console.log(`Level: ${level.toUpperCase()}`);
console.log();

runConformanceSuite({
  endpoint,
  level,
  timeout,
  onTestComplete(result) {
    if (!jsonOutput) {
      const marker = result.passed ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      const line = `  ${marker} [${result.id}] ${result.name} (${result.duration.toFixed(0)}ms)`;
      console.log(line);
      if (result.error) console.log(`    \x1b[31m→ ${result.error}\x1b[0m`);
    }
  },
}).then((result) => {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log();
    console.log(`${result.passed} passed, ${result.failed} failed`);
    if (result.failed === 0) {
      console.log(`\x1b[32mAgent is H2A ${level.toUpperCase()} CONFORMANT\x1b[0m`);
    } else {
      console.log(`\x1b[31mAgent is NOT H2A ${level.toUpperCase()} conformant\x1b[0m`);
    }
  }

  process.exit(result.failed > 0 ? 1 : 0);
}).catch((err) => {
  console.error(`Suite failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});

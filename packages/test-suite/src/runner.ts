import type { ConformanceLevel } from "@h2a/core";
import type { SuiteResult, TestResult } from "./index.js";
import type { ConformanceTest, TestContext } from "./tests.js";
import { BASIC_TESTS, STANDARD_TESTS, STANDARD_VALIDATION_TESTS, FULL_TESTS } from "./tests.js";

export interface ConformanceSuiteOptions {
  endpoint: string;
  level: ConformanceLevel;
  timeout?: number;
  fetch?: typeof globalThis.fetch;
  onTestComplete?: (result: TestResult) => void;
}

function getTestsForLevel(level: ConformanceLevel): ConformanceTest[] {
  switch (level) {
    case "basic":
      return [...BASIC_TESTS];
    case "standard":
      return [...BASIC_TESTS, ...STANDARD_TESTS, ...STANDARD_VALIDATION_TESTS];
    case "full":
      return [...BASIC_TESTS, ...STANDARD_TESTS, ...STANDARD_VALIDATION_TESTS, ...FULL_TESTS];
  }
}

export async function runConformanceSuite(options: ConformanceSuiteOptions): Promise<SuiteResult> {
  const tests = getTestsForLevel(options.level);
  const results: TestResult[] = [];
  const ctx: TestContext = {
    endpoint: options.endpoint.replace(/\/$/, ""),
    fetch: options.fetch ?? globalThis.fetch,
    timeout: options.timeout ?? 10000,
  };

  for (const test of tests) {
    const start = performance.now();
    let result: TestResult;

    try {
      await test.run(ctx);
      result = {
        id: test.id,
        name: test.name,
        level: test.level,
        passed: true,
        duration: performance.now() - start,
      };
    } catch (err) {
      result = {
        id: test.id,
        name: test.name,
        level: test.level,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
        duration: performance.now() - start,
      };
    }

    results.push(result);
    options.onTestComplete?.(result);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    endpoint: options.endpoint,
    timestamp: new Date().toISOString(),
    level: options.level,
    results,
    passed,
    failed,
    skipped: 0,
  };
}

export function formatSuiteResult(result: SuiteResult): string {
  const lines: string[] = [
    `H2A Conformance Test — ${result.level.toUpperCase()} Level`,
    `Endpoint: ${result.endpoint}`,
    `Time: ${result.timestamp}`,
    "",
  ];

  for (const test of result.results) {
    const status = test.passed ? "PASS" : "FAIL";
    const marker = test.passed ? "✓" : "✗";
    lines.push(`  ${marker} [${test.id}] ${test.name} (${test.duration.toFixed(0)}ms)`);
    if (test.error) {
      lines.push(`    → ${test.error}`);
    }
  }

  lines.push("");
  lines.push(`Results: ${result.passed} passed, ${result.failed} failed`);

  if (result.failed === 0) {
    lines.push(`\nAgent is H2A ${result.level.toUpperCase()} CONFORMANT`);
  } else {
    lines.push(`\nAgent is NOT H2A ${result.level.toUpperCase()} conformant`);
  }

  return lines.join("\n");
}

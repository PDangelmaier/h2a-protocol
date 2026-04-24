import type { ConformanceLevel } from "@h2a/core";

export interface TestResult {
  id: string;
  name: string;
  level: ConformanceLevel;
  passed: boolean;
  error?: string;
  duration: number;
}

export interface SuiteResult {
  endpoint: string;
  timestamp: string;
  level: ConformanceLevel;
  results: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
}

export { runConformanceSuite, type ConformanceSuiteOptions } from "./runner.js";
export { BASIC_TESTS, STANDARD_TESTS, STANDARD_VALIDATION_TESTS, FULL_TESTS } from "./tests.js";

# @h2a/test-suite

Conformance test suite for [H2A Protocol](https://github.com/The1ne/h2a-protocol) implementations.

23 tests across three conformance levels.

## Install

```bash
npm install @h2a/test-suite
```

## Quick Start

```bash
# Test a running H2A agent
npx h2a-test --endpoint http://localhost:8100 --level basic

# Full conformance
npx h2a-test --endpoint http://localhost:8100 --level full

# JSON output for CI
npx h2a-test --endpoint http://localhost:8100 --level full --json
```

## Conformance Levels

| Level | Tests | What's tested |
|-------|-------|---------------|
| Basic (6) | B-01 to B-06 | Session lifecycle, text streaming, interrupts, error handling |
| Standard (7) | S-01 to S-07 | Presence, state sync, tool cards, capabilities, deny/feedback signals |
| Full (10) | F-01 to F-10 | Orchestration, security sanitization, validation, path allowlists |

## Programmatic Usage

```typescript
import { runConformanceTests } from "@h2a/test-suite";

const results = await runConformanceTests({
  endpoint: "http://localhost:8100",
  level: "standard",
});
```

## License

MIT

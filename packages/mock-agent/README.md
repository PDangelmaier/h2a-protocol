# @h2a/mock-agent

Deterministic mock agent for testing [H2A Protocol](https://github.com/The1ne/h2a-protocol) integrations.

## Install

```bash
npm install @h2a/mock-agent
```

## Quick Start

```bash
npx @h2a/mock-agent
# → H2A Mock Agent running on http://localhost:8100
```

## Scenarios

| Scenario | Endpoint | Behavior |
|----------|----------|----------|
| echo | `/?scenario=echo` | Echoes input as single text frame |
| slow-stream | `/?scenario=slow-stream` | Streams text word-by-word with delays |
| orchestrate | `/?scenario=orchestrate` | Tool cards, progress, confirmation, toast |
| error | `/?scenario=error` | Partial text then error frame |

## Programmatic Usage

```typescript
import { createMockServer } from "@h2a/mock-agent";

const server = createMockServer({ port: 8100 });
```

## License

MIT

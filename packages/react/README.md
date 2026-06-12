# @h2a/react

React SDK for the [H2A (Human-to-Agent) Protocol](https://github.com/PDangelmaier/h2a-protocol).

## Install

```bash
npm install @h2a/core @h2a/react
```

## Quick Start

```tsx
import { H2AProvider, H2AChat, PresenceIndicator } from "@h2a/react";

function App() {
  return (
    <H2AProvider endpoint="http://localhost:8100">
      <PresenceIndicator />
      <H2AChat placeholder="Talk to the agent..." />
    </H2AProvider>
  );
}
```

## Hooks

- **useH2A()** — Full client access (connect, sendSignal, frames, presence)
- **usePresence()** — Current presence state (rest, attentive, conversing, orchestrating)
- **useFrames()** — Stream of agent frames with optional type filtering

## Components

- **H2AProvider** — Context provider, manages connection lifecycle
- **H2AChat** — Drop-in chat UI with streaming text and presence
- **PresenceIndicator** — Visual presence state (color + animation)

## License

MIT

# @h2a/vercel-ai

H2A adapter for Vercel AI SDK. Use H2A agents with `useChat` and Next.js API routes.

## Install

```bash
npm install @h2a/vercel-ai @h2a/core
```

## Usage

### Next.js API Route (Server)

```ts
// app/api/chat/route.ts
import { H2AStream } from "@h2a/vercel-ai";

export async function POST(req: Request) {
  const stream = H2AStream({
    endpoint: process.env.H2A_AGENT_URL ?? "http://localhost:8100",
    onPresence(update) {
      console.log("Agent presence:", update.state);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
```

### Client (React)

```tsx
import { createH2AChatManager } from "@h2a/vercel-ai";

const manager = createH2AChatManager({
  endpoint: "http://localhost:8100",
  onPresence(state) {
    console.log("Presence:", state);
  },
});

await manager.connect();
manager.setInput("Hello!");
await manager.handleSubmit();
```

For full React hooks, use `@h2a/react` directly instead.

## API

### `H2AStream(options)` — Server-side

Converts an H2A SSE stream into a Vercel AI SDK-compatible `ReadableStream`. Text frames become plain text chunks. Non-text frames are sent as data messages.

### `toH2AResponse(options)` — Server-side

Wraps `H2AStream` in a `Response` object for Next.js route handlers.

### `createH2AChatManager(options)` — Client-side

Framework-agnostic chat state manager with subscribe/notify pattern.

## License

MIT

/**
 * Server-side helper: wraps an H2A agent into a Response compatible with
 * Vercel AI SDK's route handler expectations.
 *
 * Usage in Next.js API route:
 *   export async function POST(req: Request) {
 *     return toH2AResponse({ endpoint: "http://agent:8100", body: await req.json() });
 *   }
 */

import { H2AStream, type H2AStreamOptions } from "./stream.js";

interface ToH2AResponseOptions extends H2AStreamOptions {
  body?: unknown;
}

export function toH2AResponse(options: ToH2AResponseOptions): Response {
  const stream = H2AStream(options);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

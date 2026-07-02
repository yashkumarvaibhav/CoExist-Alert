import { createSseStreamResponse } from "@/stream/sse";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return createSseStreamResponse({ signal: request.signal });
}

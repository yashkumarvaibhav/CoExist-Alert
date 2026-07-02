import { streamHub, type StreamHub } from "./hub";
import type { FieldStreamEvent } from "./events";

const encoder = new TextEncoder();

export function formatSseEvent(event: FieldStreamEvent): string {
  return [
    `id: ${event.id}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
    "",
    "",
  ].join("\n");
}

export interface CreateSseStreamOptions {
  hub?: StreamHub;
  signal?: AbortSignal;
  heartbeatMs?: number;
}

export function createSseStreamResponse(
  options: CreateSseStreamOptions = {},
): Response {
  const hub = options.hub ?? streamHub;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const requestSignal = options.signal;

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(chunk));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        unsubscribe = null;
        if (heartbeat !== null) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        controller.close();
      };

      send(": connected\n\n");
      unsubscribe = hub.subscribe((event) => {
        send(formatSseEvent(event));
      });

      if (heartbeatMs > 0) {
        heartbeat = setInterval(() => {
          send(": heartbeat\n\n");
        }, heartbeatMs);
      }

      requestSignal?.addEventListener("abort", close, { once: true });
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      unsubscribe = null;
      if (heartbeat !== null) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

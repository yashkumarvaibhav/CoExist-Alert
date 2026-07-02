import { randomUUID } from "node:crypto";

import type { FieldStreamEvent, StreamEventDraft } from "./events";

export type StreamListener = (event: FieldStreamEvent) => void;

export class StreamHub {
  private listeners = new Set<StreamListener>();
  private sequence = 0;

  subscribe(listener: StreamListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(draft: StreamEventDraft): FieldStreamEvent {
    this.sequence += 1;
    const event = {
      id: `${this.sequence}-${randomUUID()}`,
      ...draft,
    } as FieldStreamEvent;

    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  reset(): void {
    this.listeners.clear();
    this.sequence = 0;
  }
}

// Anchored on globalThis: Next.js compiles instrumentation and route handlers
// into separate module graphs, so a module-level singleton would fork and
// sweep/simulator publishes would never reach SSE subscribers.
const HUB_KEY = Symbol.for("coexist-alert.stream-hub");
const globalStore = globalThis as unknown as Record<symbol, unknown>;

function resolveHub(): StreamHub {
  const existing = globalStore[HUB_KEY] as StreamHub | undefined;
  if (existing !== undefined) return existing;
  const hub = new StreamHub();
  globalStore[HUB_KEY] = hub;
  return hub;
}

export const streamHub = resolveHub();

export function publishStreamEvents(drafts: StreamEventDraft[]): FieldStreamEvent[] {
  return drafts.map((draft) => streamHub.publish(draft));
}

export function resetStreamHub(): void {
  streamHub.reset();
}

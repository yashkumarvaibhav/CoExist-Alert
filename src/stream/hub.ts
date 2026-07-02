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

export const streamHub = new StreamHub();

export function publishStreamEvents(drafts: StreamEventDraft[]): FieldStreamEvent[] {
  return drafts.map((draft) => streamHub.publish(draft));
}

export function resetStreamHub(): void {
  streamHub.reset();
}

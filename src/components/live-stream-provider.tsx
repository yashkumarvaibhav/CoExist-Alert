"use client";

import { createContext, useEffect, useState } from "react";

import {
  STREAM_EVENT_TYPES,
  type FieldStreamEvent,
  type StreamEventType,
} from "@/stream/events";

/**
 * One EventSource per page, fanned out to every live component. Browsers cap
 * concurrent connections per host, so the dot, map, feed, health board and
 * cascade panel must share a single stream instead of opening five.
 */

export type LiveStreamStatus = "connecting" | "open" | "reconnecting";

export interface StreamSubscriber {
  types: ReadonlySet<StreamEventType>;
  onEvent: (event: FieldStreamEvent) => void;
}

export interface ClientStreamHub {
  connect: () => void;
  disconnect: () => void;
  subscribeEvents: (subscriber: StreamSubscriber) => () => void;
  subscribeStatus: (onChange: () => void) => () => void;
  getStatus: () => LiveStreamStatus;
}

export function createClientStreamHub(url: string): ClientStreamHub {
  let source: EventSource | null = null;
  let status: LiveStreamStatus = "connecting";
  const eventSubscribers = new Set<StreamSubscriber>();
  const statusSubscribers = new Set<() => void>();

  function setStatus(next: LiveStreamStatus): void {
    if (status === next) return;
    status = next;
    for (const notify of [...statusSubscribers]) notify();
  }

  return {
    connect() {
      if (source !== null) return;
      const eventSource = new EventSource(url);
      source = eventSource;
      eventSource.onopen = () => setStatus("open");
      eventSource.onerror = () => setStatus("reconnecting");
      for (const type of STREAM_EVENT_TYPES) {
        eventSource.addEventListener(type, (message) => {
          const parsed = JSON.parse(
            (message as MessageEvent<string>).data,
          ) as FieldStreamEvent;
          setStatus("open");
          for (const subscriber of [...eventSubscribers]) {
            if (subscriber.types.has(parsed.type)) subscriber.onEvent(parsed);
          }
        });
      }
    },
    disconnect() {
      source?.close();
      source = null;
      setStatus("connecting");
    },
    subscribeEvents(subscriber) {
      eventSubscribers.add(subscriber);
      return () => eventSubscribers.delete(subscriber);
    },
    subscribeStatus(onChange) {
      statusSubscribers.add(onChange);
      return () => statusSubscribers.delete(onChange);
    },
    getStatus: () => status,
  };
}

export const LiveStreamContext = createContext<ClientStreamHub | null>(null);

export function LiveStreamProvider({
  url = "/api/stream",
  children,
}: {
  url?: string;
  children: React.ReactNode;
}) {
  const [hub] = useState(() => createClientStreamHub(url));

  useEffect(() => {
    hub.connect();
    return () => hub.disconnect();
  }, [hub]);

  return (
    <LiveStreamContext.Provider value={hub}>
      {children}
    </LiveStreamContext.Provider>
  );
}

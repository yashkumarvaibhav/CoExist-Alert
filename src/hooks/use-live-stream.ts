"use client";

import { useEffect, useState } from "react";

import {
  STREAM_EVENT_TYPES,
  type FieldStreamEvent,
  type StreamEventType,
} from "@/stream/events";

export type LiveStreamStatus = "connecting" | "open" | "reconnecting";

export interface UseLiveStreamOptions {
  url?: string;
  types?: readonly StreamEventType[];
  onEvent?: (event: FieldStreamEvent) => void;
}

export interface LiveStreamState {
  status: LiveStreamStatus;
  lastEvent: FieldStreamEvent | null;
  events: FieldStreamEvent[];
  errorCount: number;
}

export function useLiveStream({
  url = "/api/stream",
  types = STREAM_EVENT_TYPES,
  onEvent,
}: UseLiveStreamOptions = {}): LiveStreamState {
  const [state, setState] = useState<LiveStreamState>({
    status: "connecting",
    lastEvent: null,
    events: [],
    errorCount: 0,
  });

  useEffect(() => {
    const source = new EventSource(url);
    const listeners: Array<[StreamEventType, EventListener]> = [];

    source.onopen = () => {
      setState((current) => ({ ...current, status: "open" }));
    };
    source.onerror = () => {
      setState((current) => ({
        ...current,
        status: "reconnecting",
        errorCount: current.errorCount + 1,
      }));
    };

    for (const type of types) {
      const listener: EventListener = (message) => {
        const parsed = JSON.parse((message as MessageEvent<string>).data) as FieldStreamEvent;
        onEvent?.(parsed);
        setState((current) => ({
          ...current,
          status: "open",
          lastEvent: parsed,
          events: [...current.events.slice(-99), parsed],
        }));
      };
      source.addEventListener(type, listener);
      listeners.push([type, listener]);
    }

    return () => {
      for (const [type, listener] of listeners) {
        source.removeEventListener(type, listener);
      }
      source.close();
    };
  }, [onEvent, types, url]);

  return state;
}

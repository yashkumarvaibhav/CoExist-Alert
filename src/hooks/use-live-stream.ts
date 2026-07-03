"use client";

import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  LiveStreamContext,
  createClientStreamHub,
  type ClientStreamHub,
  type LiveStreamStatus,
} from "@/components/live-stream-provider";
import {
  STREAM_EVENT_TYPES,
  type FieldStreamEvent,
  type StreamEventType,
} from "@/stream/events";

export type { LiveStreamStatus };

export interface UseLiveStreamOptions {
  url?: string;
  types?: readonly StreamEventType[];
  onEvent?: (event: FieldStreamEvent) => void;
}

/**
 * Live field-stream subscription. Inside a <LiveStreamProvider> every caller
 * shares one EventSource; without one the hook opens its own (standalone
 * views). Pass a stable `types` array; `onEvent` is read through a ref so its
 * identity never resubscribes the stream.
 */
export function useLiveStream({
  url = "/api/stream",
  types = STREAM_EVENT_TYPES,
  onEvent,
}: UseLiveStreamOptions = {}): { status: LiveStreamStatus } {
  const sharedHub = useContext(LiveStreamContext);
  // Standalone fallback (no provider): the component owns its own stream.
  const [localHub] = useState<ClientStreamHub | null>(() =>
    sharedHub === null ? createClientStreamHub(url) : null,
  );
  const hub = sharedHub ?? (localHub as ClientStreamHub);

  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });
  const hasHandler = onEvent !== undefined;

  useEffect(() => {
    if (sharedHub !== null || localHub === null) return;
    localHub.connect();
    return () => localHub.disconnect();
  }, [localHub, sharedHub]);

  useEffect(() => {
    if (!hasHandler || types.length === 0) return;
    return hub.subscribeEvents({
      types: new Set(types),
      onEvent: (event) => onEventRef.current?.(event),
    });
  }, [hasHandler, hub, types]);

  const status = useSyncExternalStore(
    hub.subscribeStatus,
    hub.getStatus,
    () => "connecting" as const,
  );

  return { status };
}

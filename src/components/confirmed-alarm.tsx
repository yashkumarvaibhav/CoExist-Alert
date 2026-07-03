"use client";

import { useCallback, useMemo, useState } from "react";

import { useAlarm } from "@/hooks/use-alarm";
import { useLiveStream } from "@/hooks/use-live-stream";
import { hasActiveAlarm, reduceAlarmStates, seedAlarmStates } from "@/lib/alarm";
import type { EventState } from "@/domain/types";
import type { FieldStreamEvent, StreamEventType } from "@/stream/events";

// Only event deltas move the alarm state.
const ALARM_STREAM_TYPES: readonly StreamEventType[] = ["event"];

export interface AlarmSeedEvent {
  id: string;
  state: EventState;
  nodeId: string;
}

/**
 * Headless: sounds the warning hooter while any tracked event is confirmed
 * (unacknowledged), and silences on acknowledge/resolve. Seeded from the
 * server-rendered open events so a page that loads with an event already
 * confirmed alarms immediately (the SSE stream sends no snapshot on connect).
 * `nodeIds` scopes the watch to a persona's assigned nodes (Guard). Renders
 * nothing. Command mounts this in the shell; Guard/Channels drive useAlarm
 * directly from their own event state.
 */
export function ConfirmedAlarm({
  initialEvents,
  nodeIds,
}: {
  initialEvents: AlarmSeedEvent[];
  nodeIds?: string[];
}) {
  const nodeScope = useMemo(
    () => (nodeIds === undefined ? undefined : new Set(nodeIds)),
    [nodeIds],
  );

  const [states, setStates] = useState<ReadonlyMap<string, EventState>>(() =>
    seedAlarmStates(initialEvents, nodeScope),
  );

  const onEvent = useCallback(
    (streamEvent: FieldStreamEvent) => {
      setStates((current) => reduceAlarmStates(current, streamEvent, nodeScope));
    },
    [nodeScope],
  );

  useLiveStream({ types: ALARM_STREAM_TYPES, onEvent });

  useAlarm(hasActiveAlarm(states.values()));

  return null;
}

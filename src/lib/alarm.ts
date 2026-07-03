import type { EventState } from "@/domain/types";
import type { FieldStreamEvent } from "@/stream/events";

/**
 * Alert-alarm model for the Command/Guard/Channels surfaces. The warning hooter
 * *sounds continuously* while at least one relevant event is unacknowledged,
 * and silences the moment a responder acknowledges (which moves the event
 * `confirmed` → `responding`), resolves, or it expires.
 *
 * "Alarming" is therefore exactly the `confirmed` state: an event that has been
 * corroborated and alerted on, but not yet acted on. The functions here are
 * pure so the sounding decision is unit-tested independently of WebAudio.
 */

/** Whether a single event's state should keep the alarm sounding. */
export function isAlarmingState(state: EventState): boolean {
  return state === "confirmed";
}

/** Whether any tracked event currently keeps the alarm sounding. */
export function hasActiveAlarm(states: Iterable<EventState>): boolean {
  for (const state of states) {
    if (isAlarmingState(state)) return true;
  }
  return false;
}

/** The ids of the events currently keeping the alarm sounding (for a11y copy). */
export function alarmingEventIds(
  events: Iterable<{ id: string; state: EventState }>,
): string[] {
  const ids: string[] = [];
  for (const event of events) {
    if (isAlarmingState(event.state)) ids.push(event.id);
  }
  return ids;
}

/**
 * Fold a live stream delta into a tracked event-state map, scoped to an
 * optional set of node ids (Guard watches only its assigned nodes). Returns a
 * new map only when something relevant changed, so callers can keep referential
 * stability. Non-`event` deltas are ignored.
 */
export function reduceAlarmStates(
  current: ReadonlyMap<string, EventState>,
  streamEvent: FieldStreamEvent,
  nodeIds?: ReadonlySet<string>,
): ReadonlyMap<string, EventState> {
  if (streamEvent.type !== "event") return current;
  const event = streamEvent.payload;
  if (nodeIds !== undefined && !nodeIds.has(event.nodeId)) return current;
  if (current.get(event.id) === event.state) return current;
  const next = new Map(current);
  next.set(event.id, event.state);
  return next;
}

/** Seed a tracked event-state map from server-rendered initial events. */
export function seedAlarmStates(
  events: Iterable<{ id: string; state: EventState; nodeId: string }>,
  nodeIds?: ReadonlySet<string>,
): Map<string, EventState> {
  const map = new Map<string, EventState>();
  for (const event of events) {
    if (nodeIds !== undefined && !nodeIds.has(event.nodeId)) continue;
    map.set(event.id, event.state);
  }
  return map;
}

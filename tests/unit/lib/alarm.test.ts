import { describe, expect, it } from "vitest";

import {
  alarmingEventIds,
  hasActiveAlarm,
  isAlarmingState,
  reduceAlarmStates,
  seedAlarmStates,
} from "@/lib/alarm";
import type { EventState } from "@/domain/types";
import type { FieldStreamEvent } from "@/stream/events";

function eventDelta(id: string, nodeId: string, state: EventState): FieldStreamEvent {
  return {
    id: `stream-${id}`,
    type: "event",
    at: "2026-07-03T00:00:00.000Z",
    payload: {
      id,
      nodeId,
      openedAt: "2026-07-03T00:00:00.000Z",
      state,
      confirmedAt: state === "confirmed" ? "2026-07-03T00:00:04.000Z" : null,
      resolvedAt: null,
      speciesLabel: "elephant_class",
      leadSignalId: "sig-1",
      confirmSignalId: "sig-2",
      firstDeliveryAt: null,
    },
  };
}

describe("alarm sounding decision", () => {
  it("alarms only on the confirmed (unacknowledged) state", () => {
    expect(isAlarmingState("confirmed")).toBe(true);
    for (const state of ["unconfirmed", "responding", "resolved", "expired"] as const) {
      expect(isAlarmingState(state)).toBe(false);
    }
  });

  it("sounds while any tracked event is confirmed and stops when none are", () => {
    expect(hasActiveAlarm(["responding", "resolved"])).toBe(false);
    expect(hasActiveAlarm(["responding", "confirmed"])).toBe(true);
    expect(hasActiveAlarm([])).toBe(false);
  });

  it("lists the confirmed event ids for accessible copy", () => {
    expect(
      alarmingEventIds([
        { id: "e1", state: "confirmed" },
        { id: "e2", state: "responding" },
        { id: "e3", state: "confirmed" },
      ]),
    ).toEqual(["e1", "e3"]);
  });
});

describe("alarm state reduction from the live stream", () => {
  it("records a newly confirmed event, then silences it on acknowledge", () => {
    let states: ReadonlyMap<string, EventState> = new Map();
    states = reduceAlarmStates(states, eventDelta("e1", "n1", "confirmed"));
    expect(hasActiveAlarm(states.values())).toBe(true);

    // Acknowledge moves the same event to responding — alarm stops.
    states = reduceAlarmStates(states, eventDelta("e1", "n1", "responding"));
    expect(hasActiveAlarm(states.values())).toBe(false);
  });

  it("ignores events outside the node scope (Guard's assigned nodes)", () => {
    const scope = new Set(["n1"]);
    let states: ReadonlyMap<string, EventState> = new Map();
    states = reduceAlarmStates(states, eventDelta("e9", "n2", "confirmed"), scope);
    expect(states.size).toBe(0);
    states = reduceAlarmStates(states, eventDelta("e1", "n1", "confirmed"), scope);
    expect(hasActiveAlarm(states.values())).toBe(true);
  });

  it("returns the same map reference when nothing relevant changed", () => {
    const seed = seedAlarmStates([{ id: "e1", nodeId: "n1", state: "confirmed" }]);
    const same = reduceAlarmStates(seed, eventDelta("e1", "n1", "confirmed"));
    expect(same).toBe(seed);
    const nonEvent: FieldStreamEvent = {
      id: "stream-x",
      type: "response",
      at: "2026-07-03T00:00:00.000Z",
      payload: {
        id: "r1",
        eventId: "e1",
        responderId: "guard-1",
        action: "acknowledged",
        at: "2026-07-03T00:00:00.000Z",
      },
    };
    expect(reduceAlarmStates(seed, nonEvent)).toBe(seed);
  });

  it("seeds from server events, honouring node scope", () => {
    const all = seedAlarmStates([
      { id: "e1", nodeId: "n1", state: "confirmed" },
      { id: "e2", nodeId: "n2", state: "resolved" },
    ]);
    expect(all.size).toBe(2);
    const scoped = seedAlarmStates(
      [
        { id: "e1", nodeId: "n1", state: "confirmed" },
        { id: "e2", nodeId: "n2", state: "confirmed" },
      ],
      new Set(["n1"]),
    );
    expect([...scoped.keys()]).toEqual(["e1"]);
  });
});

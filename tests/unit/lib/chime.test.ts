import { describe, expect, it } from "vitest";

import { isNewConfirmation } from "@/lib/chime";
import type { FieldStreamEvent } from "@/stream/events";

function eventDelta(id: string, state: string): FieldStreamEvent {
  return {
    id: `stream-${id}`,
    type: "event",
    at: "2026-07-03T00:00:00.000Z",
    payload: {
      id,
      nodeId: "n2",
      openedAt: "2026-07-03T00:00:00.000Z",
      state: state as never,
      confirmedAt: "2026-07-03T00:00:04.000Z",
      resolvedAt: null,
      speciesLabel: "elephant_class",
      leadSignalId: "sig-1",
      confirmSignalId: "sig-2",
      firstDeliveryAt: null,
    },
  };
}

describe("confirmed-event chime trigger", () => {
  it("fires for a freshly confirmed event", () => {
    expect(isNewConfirmation(new Set(), eventDelta("evt-1", "confirmed"))).toBe(true);
  });

  it("stays silent for a confirmation already seen", () => {
    const seen = new Set(["evt-1"]);
    expect(isNewConfirmation(seen, eventDelta("evt-1", "confirmed"))).toBe(false);
  });

  it("does not fire on non-confirmed states", () => {
    for (const state of ["unconfirmed", "responding", "resolved", "expired"]) {
      expect(isNewConfirmation(new Set(), eventDelta("evt-1", state))).toBe(false);
    }
  });

  it("ignores non-event stream deltas", () => {
    const nodeStatus: FieldStreamEvent = {
      id: "stream-x",
      type: "node-status",
      at: "2026-07-03T00:00:00.000Z",
      payload: {
        nodeId: "n2",
        status: "healthy",
        batteryPct: 80,
        linkQualityPct: 90,
        lastHeartbeatAt: "2026-07-03T00:00:00.000Z",
      },
    };
    expect(isNewConfirmation(new Set(), nodeStatus)).toBe(false);
  });
});

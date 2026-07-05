import { describe, expect, it } from "vitest";

import type { Alert, EventResponse, IncursionEvent } from "@/domain/types";
import { eventsToNdjson, toEventExportRecord } from "@/export/events-ndjson";

function makeEvent(overrides: Partial<IncursionEvent> = {}): IncursionEvent {
  return {
    id: "evt-1",
    nodeId: "n2",
    openedAt: "2026-07-01T12:00:00.000Z",
    state: "resolved",
    confirmedAt: "2026-07-01T12:00:31.000Z",
    resolvedAt: "2026-07-01T12:20:31.000Z",
    speciesLabel: "elephant_class",
    leadSignalId: "sig-1",
    confirmSignalId: "sig-2",
    firstDeliveryAt: "2026-07-01T12:00:35.000Z",
    ...overrides,
  };
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "al-1",
    eventId: "evt-1",
    outageId: null,
    tier: 1,
    channel: "siren",
    targetRef: "n2",
    status: "delivered",
    queuedAt: "2026-07-01T12:00:33.000Z",
    sentAt: "2026-07-01T12:00:34.000Z",
    deliveredAt: "2026-07-01T12:00:35.000Z",
    failedReason: null,
    isLive: false,
    ...overrides,
  };
}

function makeResponse(overrides: Partial<EventResponse> = {}): EventResponse {
  return {
    id: "rsp-1",
    eventId: "evt-1",
    responderId: "guard-sharma",
    action: "acknowledged",
    at: "2026-07-01T12:01:20.000Z",
    ...overrides,
  };
}

describe("toEventExportRecord", () => {
  it("flattens a confirmed, delivered and resolved event with responder timings", () => {
    const record = toEventExportRecord(
      makeEvent(),
      [
        makeAlert({ id: "al-1", tier: 1, channel: "siren", status: "delivered" }),
        makeAlert({ id: "al-2", tier: 1, channel: "guard_webex", status: "acked", isLive: true }),
        makeAlert({ id: "al-3", tier: 2, channel: "control_room", status: "failed", failedReason: "timeout" }),
      ],
      [
        makeResponse({ id: "r1", action: "acknowledged", at: "2026-07-01T12:01:20.000Z" }),
        makeResponse({ id: "r2", action: "resolved", at: "2026-07-01T12:20:31.000Z" }),
      ],
    );

    expect(record.event_id).toBe("evt-1");
    expect(record.node_id).toBe("n2");
    expect(record.state).toBe("resolved");
    expect(record.species_label).toBe("elephant_class");
    expect(record.confirmed).toBe(true);
    expect(record.opened_at).toBe("2026-07-01T12:00:00.000Z");
    expect(record.confirmed_at).toBe("2026-07-01T12:00:31.000Z");
    expect(record.first_delivery_at).toBe("2026-07-01T12:00:35.000Z");
    expect(record.resolved_at).toBe("2026-07-01T12:20:31.000Z");
    // detection (opened) -> first delivered warning
    expect(record.lead_time_seconds).toBe(35);
    // confirmation -> first acknowledgement
    expect(record.acknowledge_seconds).toBe(49);
    // confirmation -> resolution
    expect(record.resolution_seconds).toBe(1200);
    expect(record.max_tier).toBe(2);
    expect(record.channels).toEqual(["control_room", "guard_webex", "siren"]);
    expect(record.alerts_total).toBe(3);
    expect(record.alerts_delivered).toBe(2); // delivered + acked
    expect(record.alerts_failed).toBe(1);
    expect(record.responses_count).toBe(2);
    expect(record.live_webex).toBe(true);
  });

  it("emits null timings and empty aggregates for an expired event that never alerted", () => {
    const record = toEventExportRecord(
      makeEvent({
        id: "evt-x",
        state: "expired",
        confirmedAt: null,
        resolvedAt: null,
        confirmSignalId: null,
        firstDeliveryAt: null,
      }),
      [],
      [],
    );

    expect(record.confirmed).toBe(false);
    expect(record.confirmed_at).toBeNull();
    expect(record.first_delivery_at).toBeNull();
    expect(record.lead_time_seconds).toBeNull();
    expect(record.acknowledge_seconds).toBeNull();
    expect(record.resolution_seconds).toBeNull();
    expect(record.max_tier).toBeNull();
    expect(record.channels).toEqual([]);
    expect(record.alerts_total).toBe(0);
    expect(record.alerts_delivered).toBe(0);
    expect(record.alerts_failed).toBe(0);
    expect(record.responses_count).toBe(0);
    expect(record.live_webex).toBe(false);
  });

  it("is delivered when acknowledged but has no acknowledge time without a confirmation", () => {
    const record = toEventExportRecord(
      makeEvent({ confirmedAt: null, resolvedAt: null }),
      [makeAlert({ status: "acked" })],
      [makeResponse({ action: "acknowledged" })],
    );
    expect(record.alerts_delivered).toBe(1);
    expect(record.acknowledge_seconds).toBeNull(); // no confirmation timestamp to measure from
  });
});

describe("eventsToNdjson", () => {
  it("serializes one newline-terminated JSON object per record", () => {
    const records = [
      toEventExportRecord(makeEvent({ id: "a" }), [], []),
      toEventExportRecord(makeEvent({ id: "b" }), [], []),
    ];
    const body = eventsToNdjson(records);
    const lines = body.split("\n");
    // trailing newline -> last split element is empty
    expect(lines.at(-1)).toBe("");
    const parsed = lines.filter((line) => line.length > 0).map((line) => JSON.parse(line));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].event_id).toBe("a");
    expect(parsed[1].event_id).toBe("b");
  });

  it("returns an empty string for no events", () => {
    expect(eventsToNdjson([])).toBe("");
  });
});

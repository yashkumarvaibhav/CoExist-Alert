import { describe, expect, it } from "vitest";

import {
  analyticsWindow,
  buildHotspotAnalytics,
  buildReliabilityAnalytics,
  hotspotWindow,
} from "@/lib/analytics";

describe("hotspot analytics snapshot", () => {
  it("builds a complete node by hour matrix with peak and dawn/dusk summaries", () => {
    const nodes = [
      { id: "n1", name: "Village Boundary East", kind: "village_boundary" as const },
      { id: "n2", name: "Rail Crossing KM-47", kind: "rail_crossing" as const },
    ];
    const snapshot = buildHotspotAnalytics({
      nodes,
      events: [
        { nodeId: "n2", confirmedAt: "2026-07-01T23:05:00.000Z" }, // 04 IST
        { nodeId: "n2", confirmedAt: "2026-07-02T23:15:00.000Z" }, // 04 IST
        { nodeId: "n2", confirmedAt: "2026-07-02T00:45:00.000Z" }, // 06 IST
        { nodeId: "n1", confirmedAt: "2026-07-02T12:30:00.000Z" }, // 18 IST
        { nodeId: "n1", confirmedAt: null },
      ],
      window: {
        fromIso: "2026-06-03T00:00:00.000Z",
        toIso: "2026-07-03T00:00:00.000Z",
        key: "30d",
        label: "30 d",
        days: 30,
      },
    });

    expect(snapshot.sampleSize).toBe(4);
    expect(snapshot.maxCount).toBe(2);
    expect(snapshot.peak).toEqual({
      nodeId: "n2",
      nodeName: "Rail Crossing KM-47",
      hour: 4,
      count: 2,
    });
    expect(snapshot.dawnCount).toBe(3);
    expect(snapshot.duskCount).toBe(1);
    expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.rows[0].cells).toHaveLength(24);
    expect(snapshot.rows[1].cells.find((cell) => cell.hour === 4)?.count).toBe(2);
  });

  it("derives an exclusive 30 day window ending at the provided time", () => {
    expect(hotspotWindow(new Date("2026-07-03T11:00:00.000Z"))).toEqual({
      fromIso: "2026-06-03T11:00:00.000Z",
      toIso: "2026-07-03T11:00:00.000Z",
      key: "30d",
      label: "30 d",
      days: 30,
    });
  });
});

describe("reliability analytics snapshot", () => {
  const window = analyticsWindow("30d", new Date("2026-07-03T11:00:00.000Z"));
  const nodes = [
    {
      id: "n1",
      name: "Village Boundary East",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
  ];

  it("builds KPI cards and trend samples from metric oracle inputs", () => {
    const events = Array.from({ length: 5 }, (_, index) => {
      const openedAt = new Date(
        new Date("2026-07-01T00:00:00.000Z").getTime() + index * 2 * 60 * 60_000,
      ).toISOString();
      const confirmedAt = new Date(new Date(openedAt).getTime() + 30_000).toISOString();
      return {
        id: `ev-${index}`,
        nodeId: "n1",
        openedAt,
        confirmedAt,
        firstDeliveryAt: new Date(new Date(openedAt).getTime() + (5 + index) * 1_000).toISOString(),
      };
    });
    const responses = events.flatMap((event, index) => [
      {
        eventId: event.id,
        action: "acknowledged" as const,
        at: new Date(new Date(event.confirmedAt).getTime() + (30 + index) * 1_000).toISOString(),
      },
      {
        eventId: event.id,
        action: "on_site" as const,
        at: new Date(new Date(event.confirmedAt).getTime() + (300 + index) * 1_000).toISOString(),
      },
    ]);
    const snapshot = buildReliabilityAnalytics({
      window,
      nodes,
      events,
      alerts: [
        { channel: "siren", status: "delivered" },
        { channel: "siren", status: "delivered" },
        { channel: "siren", status: "delivered" },
        { channel: "siren", status: "failed" },
        { channel: "siren", status: "delivered" },
      ],
      responses,
      outagesByNode: {
        n1: [
          {
            startedAt: "2026-07-02T00:00:00.000Z",
            endedAt: "2026-07-02T00:30:00.000Z",
          },
        ],
      },
    });

    expect(snapshot.cards.map((card) => card.label)).toEqual([
      "Median + p95 lead time",
      "Delivery success by channel",
      "Response time",
      "Uptime by node",
      "Blind-spot minutes",
    ]);
    expect(snapshot.cards.find((card) => card.id === "lead-time")?.value).toBe("7s / 9s");
    expect(snapshot.cards.find((card) => card.id === "delivery")?.value).toBe("80.0%");
    expect(snapshot.cards.find((card) => card.id === "response")?.value).toBe(
      "32s ack / 5m 2s on site",
    );
    expect(snapshot.cards.find((card) => card.id === "blind-spots")?.value).toBe(
      "30 min",
    );
    expect(snapshot.eventTrend.reduce((sum, point) => sum + (point.value ?? 0), 0)).toBe(5);
    expect(snapshot.responseTrend.some((point) => point.value === 32)).toBe(true);
  });

  it("keeps too-small samples explicit instead of inventing zeros", () => {
    const oneHour = analyticsWindow("1h", new Date("2026-07-03T11:00:00.000Z"));
    const snapshot = buildReliabilityAnalytics({
      window: oneHour,
      nodes,
      events: [],
      alerts: [],
      responses: [],
      outagesByNode: { n1: [] },
    });

    expect(snapshot.cards.find((card) => card.id === "lead-time")).toMatchObject({
      value: "n < 5",
      insufficient: true,
      sampleLabel: "sample n=0",
    });
    expect(snapshot.cards.find((card) => card.id === "delivery")).toMatchObject({
      value: "n < 5",
      insufficient: true,
    });
    expect(snapshot.responseTrend).toEqual([
      {
        label: "1 h",
        fromIso: "2026-07-03T10:00:00.000Z",
        toIso: "2026-07-03T11:00:00.000Z",
        value: null,
        sampleSize: 0,
      },
    ]);
  });
});

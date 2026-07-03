import { describe, expect, it } from "vitest";

import { buildHotspotAnalytics, hotspotWindow } from "@/lib/analytics";

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
      days: 30,
    });
  });
});

import { describe, expect, it } from "vitest";

import type { Signal } from "@/domain/types";
import { StreamHub } from "@/stream/hub";
import { formatSseEvent } from "@/stream/sse";

const T0 = "2026-07-02T04:58:02.000Z";

const signal: Signal = {
  id: "sig-1",
  nodeId: "n2",
  at: T0,
  source: "camera",
  classification: "large_animal",
  confidence: 0.62,
  snapshotPath: null,
  eventId: "evt-1",
};

describe("stream hub", () => {
  it("publishes typed events to current subscribers only", () => {
    const hub = new StreamHub();
    const received: string[] = [];
    const unsubscribe = hub.subscribe((event) => {
      received.push(`${event.type}:${event.id}`);
    });

    const first = hub.publish({ type: "signal", at: T0, payload: signal });
    unsubscribe();
    hub.publish({
      type: "node-status",
      at: T0,
      payload: {
        nodeId: "n2",
        status: "healthy",
        batteryPct: 88,
        linkQualityPct: 91,
        lastHeartbeatAt: T0,
      },
    });

    expect(received).toEqual([`signal:${first.id}`]);
    expect(hub.listenerCount()).toBe(0);
  });

  it("formats SSE frames with event name and JSON payload", () => {
    const hub = new StreamHub();
    const event = hub.publish({ type: "signal", at: T0, payload: signal });

    expect(formatSseEvent(event)).toContain(`id: ${event.id}\nevent: signal\n`);
    expect(formatSseEvent(event)).toContain("\"classification\":\"large_animal\"");
    expect(formatSseEvent(event).endsWith("\n\n")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  blindSpotMinutes,
  deliveryRateByChannel,
  hotspotBuckets,
  istHourOfDay,
  leadTimeStats,
  MIN_SAMPLES,
  responseStats,
  uptimePct,
} from "@/domain/metrics";

const T0 = "2026-07-02T00:00:00.000Z";
function plusMinutes(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * 60_000).toISOString();
}
function plusSeconds(iso: string, secs: number): string {
  return new Date(new Date(iso).getTime() + secs * 1000).toISOString();
}

describe("metrics honesty — insufficient samples", () => {
  it("lead time with fewer than MIN_SAMPLES events is insufficient, never zero", () => {
    const events = Array.from({ length: MIN_SAMPLES - 1 }, (_, i) => ({
      openedAt: T0,
      confirmedAt: plusSeconds(T0, 1),
      firstDeliveryAt: plusSeconds(T0, 4 + i),
    }));
    const stats = leadTimeStats(events);
    expect(stats.p50).toEqual({ kind: "insufficient", sampleSize: MIN_SAMPLES - 1 });
    expect(stats.p95.kind).toBe("insufficient");
  });

  it("unconfirmed and undelivered events are not lead-time samples", () => {
    const stats = leadTimeStats([
      { openedAt: T0, confirmedAt: null, firstDeliveryAt: null },
      { openedAt: T0, confirmedAt: plusSeconds(T0, 1), firstDeliveryAt: null },
    ]);
    expect(stats.p50).toEqual({ kind: "insufficient", sampleSize: 0 });
  });

  it("a channel with zero terminal deliveries reports insufficient, not NaN", () => {
    const rates = deliveryRateByChannel([
      { channel: "siren", status: "queued" },
      { channel: "siren", status: "sent" },
    ]);
    expect(rates.siren).toEqual({ kind: "insufficient", sampleSize: 0 });
  });
});

describe("lead time percentiles", () => {
  it("computes p50 and p95 from detection to FIRST DELIVERY (not sent)", () => {
    // Lead times: 2,3,4,5,6,7,8,9,10,11 seconds.
    const events = Array.from({ length: 10 }, (_, i) => ({
      openedAt: T0,
      confirmedAt: plusSeconds(T0, 1),
      firstDeliveryAt: plusSeconds(T0, 2 + i),
    }));
    const stats = leadTimeStats(events);
    expect(stats.p50).toEqual({ kind: "ok", value: 6, sampleSize: 10 });
    expect(stats.p95).toEqual({ kind: "ok", value: 11, sampleSize: 10 });
  });
});

describe("delivery rate by channel", () => {
  it("counts delivered and acked as success, failed as failure, and ignores in-flight", () => {
    const rates = deliveryRateByChannel([
      { channel: "villager_phone", status: "delivered" },
      { channel: "villager_phone", status: "delivered" },
      { channel: "villager_phone", status: "acked" },
      { channel: "villager_phone", status: "failed" },
      { channel: "villager_phone", status: "delivered" },
      { channel: "villager_phone", status: "queued" },
      { channel: "guard_webex", status: "delivered" },
    ]);
    expect(rates.villager_phone).toEqual({ kind: "ok", value: 0.8, sampleSize: 5 });
    // Only one terminal guard_webex row — honest insufficient.
    expect(rates.guard_webex).toEqual({ kind: "insufficient", sampleSize: 1 });
  });
});

describe("response times", () => {
  it("reports median seconds from confirmation to ack and to on-site", () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      confirmedAt: T0,
    }));
    const responses = events.flatMap((e, i) => [
      { eventId: e.id, action: "acknowledged" as const, at: plusSeconds(T0, 30 + i) },
      { eventId: e.id, action: "on_site" as const, at: plusSeconds(T0, 300 + i) },
    ]);
    const stats = responseStats(events, responses);
    expect(stats.ackSeconds).toEqual({ kind: "ok", value: 32, sampleSize: 5 });
    expect(stats.onSiteSeconds).toEqual({ kind: "ok", value: 302, sampleSize: 5 });
  });

  it("only the FIRST ack per event counts", () => {
    const events = [{ id: "e1", confirmedAt: T0 }];
    const responses = [
      { eventId: "e1", action: "acknowledged" as const, at: plusSeconds(T0, 40) },
      { eventId: "e1", action: "acknowledged" as const, at: plusSeconds(T0, 90) },
    ];
    const stats = responseStats(events, responses, 1);
    expect(stats.ackSeconds).toEqual({ kind: "ok", value: 40, sampleSize: 1 });
  });
});

describe("uptime and blind-spot minutes", () => {
  const windowFrom = T0;
  const windowTo = plusMinutes(T0, 1440); // 24h window

  it("computes uptime from the outage ledger", () => {
    const uptime = uptimePct(
      { createdAt: "2026-06-01T00:00:00.000Z" },
      [{ startedAt: plusMinutes(T0, 100), endedAt: plusMinutes(T0, 136) }],
      { from: windowFrom, to: windowTo },
    );
    expect(uptime).toEqual({
      kind: "ok",
      value: (1440 - 36) / 1440,
      sampleSize: 1440,
    });
  });

  it("clamps outages to the window and counts open outages until window end", () => {
    const mins = blindSpotMinutes(
      [
        // Started before the window: only the in-window part counts.
        { startedAt: plusMinutes(T0, -30), endedAt: plusMinutes(T0, 10) },
        // Still open: counts to window end.
        { startedAt: plusMinutes(T0, 1400), endedAt: null },
      ],
      { from: windowFrom, to: windowTo },
    );
    expect(mins).toBe(10 + 40);
  });

  it("uptime excludes pre-provisioning time", () => {
    // Node created halfway through the window; no outages → 100% of its 720 min.
    const uptime = uptimePct(
      { createdAt: plusMinutes(T0, 720) },
      [],
      { from: windowFrom, to: windowTo },
    );
    expect(uptime).toEqual({ kind: "ok", value: 1, sampleSize: 720 });
  });

  it("a node created after the window end is insufficient", () => {
    const uptime = uptimePct(
      { createdAt: plusMinutes(T0, 2000) },
      [],
      { from: windowFrom, to: windowTo },
    );
    expect(uptime).toEqual({ kind: "insufficient", sampleSize: 0 });
  });
});

describe("hotspot buckets (IST hours)", () => {
  it("converts UTC timestamps to IST hour-of-day", () => {
    expect(istHourOfDay("2026-07-01T23:00:00.000Z")).toBe(4); // 04:30 IST
    expect(istHourOfDay("2026-07-02T12:00:00.000Z")).toBe(17); // 17:30 IST
    expect(istHourOfDay("2026-07-02T18:30:00.000Z")).toBe(0); // 00:00 IST
  });

  it("buckets confirmed events by node and IST hour", () => {
    const buckets = hotspotBuckets([
      { nodeId: "n2", confirmedAt: "2026-07-01T23:05:00.000Z" }, // IST hour 4
      { nodeId: "n2", confirmedAt: "2026-06-30T23:10:00.000Z" }, // IST hour 4
      { nodeId: "n2", confirmedAt: "2026-07-02T12:00:00.000Z" }, // IST hour 17
      { nodeId: "n1", confirmedAt: "2026-07-01T23:20:00.000Z" }, // IST hour 4
      { nodeId: "n1", confirmedAt: null }, // never confirmed — excluded
    ]);
    expect(buckets).toEqual(
      expect.arrayContaining([
        { nodeId: "n2", hour: 4, count: 2 },
        { nodeId: "n2", hour: 17, count: 1 },
        { nodeId: "n1", hour: 4, count: 1 },
      ]),
    );
    expect(buckets).toHaveLength(3);
  });
});

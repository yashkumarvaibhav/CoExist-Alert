import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "@/domain/types";
import type { IncursionEvent, SensorNode, Signal } from "@/domain/types";
import { SimulatorError } from "@/sim/errors";
import {
  FieldSimulator,
  type DetectionPost,
  type HeartbeatPost,
} from "@/sim/simulator";

const T0 = "2026-07-02T04:58:02.000Z";
const INTERVAL_MS = DEFAULT_SETTINGS.heartbeatIntervalS * 1000;

function makeNode(id: string, kind: SensorNode["kind"]): SensorNode {
  return {
    id,
    name: id,
    kind,
    lat: 26.87,
    lng: 88.85,
    geofenceRadiusM: 1_800,
    status: "healthy",
    batteryPct: 80,
    linkQualityPct: 90,
    lastHeartbeatAt: T0,
    createdAt: "2026-06-02T00:00:00.000Z",
  };
}

interface Harness {
  simulator: FieldSimulator;
  heartbeats: HeartbeatPost[];
  detections: DetectionPost[];
  nodes: SensorNode[];
  openEvents: IncursionEvent[];
  signals: Map<string, Signal>;
  failNextHeartbeat: () => void;
}

function createHarness(options: { ambient?: boolean } = {}): Harness {
  const nodes = [
    makeNode("n1", "village_boundary"),
    makeNode("n2", "rail_crossing"),
    makeNode("n3", "waterhole"),
  ];
  const heartbeats: HeartbeatPost[] = [];
  const detections: DetectionPost[] = [];
  const openEvents: IncursionEvent[] = [];
  const signals = new Map<string, Signal>();
  let failures = 0;

  const simulator = new FieldSimulator({
    reader: {
      listNodes: () => nodes,
      getSettings: () => DEFAULT_SETTINGS,
      listOpenEvents: () => openEvents,
      findSignalById: (id) => signals.get(id) ?? null,
    },
    transport: {
      async postHeartbeat(payload) {
        if (failures > 0) {
          failures -= 1;
          throw new Error("ingest unavailable");
        }
        heartbeats.push(payload);
      },
      async postDetection(payload) {
        detections.push(payload);
      },
    },
    seed: 7,
    ambient: options.ambient,
  });

  return {
    simulator,
    heartbeats,
    detections,
    nodes,
    openEvents,
    signals,
    failNextHeartbeat: () => {
      failures += 1;
    },
  };
}

describe("FieldSimulator", () => {
  let harness: Harness;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T0));
    harness = createHarness();
  });

  afterEach(() => {
    harness.simulator.stop();
    vi.useRealTimers();
  });

  it("posts one jittered heartbeat per node immediately and per interval", async () => {
    harness.simulator.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.heartbeats.map((beat) => beat.nodeId)).toEqual(["n1", "n2", "n3"]);
    for (const beat of harness.heartbeats) {
      expect(beat.at).toBe(T0);
      expect(Number.isInteger(beat.batteryPct)).toBe(true);
      expect(beat.batteryPct).toBeGreaterThanOrEqual(0);
      expect(beat.batteryPct).toBeLessThanOrEqual(100);
      expect(Number.isInteger(beat.linkQualityPct)).toBe(true);
      expect(beat.linkQualityPct).toBeGreaterThanOrEqual(0);
      expect(beat.linkQualityPct).toBeLessThanOrEqual(100);
    }

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(harness.heartbeats).toHaveLength(6);
    expect(harness.simulator.status()).toMatchObject({ running: true, lastError: null });

    // Link quality hovers around the node's first-seen base (90 ± 3): it must
    // jitter, not random-walk to an extreme over a long run.
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 50);
    for (const beat of harness.heartbeats) {
      expect(beat.linkQualityPct).toBeGreaterThanOrEqual(87);
      expect(beat.linkQualityPct).toBeLessThanOrEqual(93);
    }
  });

  it("suppresses heartbeats for killed nodes and resumes on restore", async () => {
    harness.simulator.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.heartbeats.length = 0;

    harness.simulator.killLink("n3");
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(harness.heartbeats.map((beat) => beat.nodeId)).toEqual(["n1", "n2"]);
    expect(harness.simulator.status().killedNodeIds).toEqual(["n3"]);

    harness.simulator.restoreLink("n3");
    harness.heartbeats.length = 0;
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(harness.heartbeats.map((beat) => beat.nodeId)).toEqual(["n1", "n2", "n3"]);
    expect(harness.simulator.status().killedNodeIds).toEqual([]);
  });

  it("rejects kill/restore for unknown nodes", () => {
    expect(() => harness.simulator.killLink("n9")).toThrowError(SimulatorError);
    expect(() => harness.simulator.restoreLink("n9")).toThrowError(SimulatorError);
  });

  it("runs the rail preset against the rail node with scripted timing", async () => {
    const scheduled = harness.simulator.runScenario("rail_crossing_confirmed");
    expect(scheduled).toMatchObject({ preset: "rail_crossing_confirmed", nodeId: "n2", steps: 2 });
    expect(harness.simulator.status().scenario).toBe("rail_crossing_confirmed");

    await vi.advanceTimersByTimeAsync(0);
    expect(harness.detections).toHaveLength(1);
    expect(harness.detections[0]).toMatchObject({
      nodeId: "n2",
      at: T0,
      source: "camera",
      confidence: 0.62,
    });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(harness.detections).toHaveLength(2);
    expect(harness.detections[1]).toMatchObject({
      nodeId: "n2",
      source: "thermal",
      classification: "elephant_class",
    });
    expect(new Date(harness.detections[1].at).getTime()).toBe(
      new Date(T0).getTime() + 4_000,
    );
    expect(harness.simulator.status().scenario).toBeNull();
  });

  it("cancels a pending scenario when a new one is triggered", async () => {
    harness.simulator.runScenario("rail_crossing_confirmed");
    await vi.advanceTimersByTimeAsync(0);

    harness.simulator.runScenario("village_dawn_incursion", "n1");
    await vi.advanceTimersByTimeAsync(10_000);

    // The rail thermal step must not fire; only village camera + motion follow.
    expect(harness.detections.map((post) => [post.nodeId, post.source])).toEqual([
      ["n2", "camera"],
      ["n1", "camera"],
      ["n1", "motion"],
    ]);
  });

  it("kills and later restores the waterhole link in the blindspot preset", async () => {
    harness.simulator.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.heartbeats.length = 0;

    harness.simulator.runScenario("node_blindspot");
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.simulator.status().killedNodeIds).toEqual(["n3"]);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 4);
    expect(harness.heartbeats.some((beat) => beat.nodeId === "n3")).toBe(false);
    expect(harness.heartbeats.some((beat) => beat.nodeId === "n1")).toBe(true);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 4);
    expect(harness.simulator.status().killedNodeIds).toEqual([]);
    expect(harness.simulator.status().scenario).toBeNull();
  });

  it("corroborates the newest open unconfirmed event from a different source", async () => {
    harness.signals.set("sig-lead", {
      id: "sig-lead",
      nodeId: "n2",
      at: T0,
      source: "camera",
      classification: "large_animal",
      confidence: 0.62,
      snapshotPath: null,
      eventId: "evt-1",
    });
    harness.openEvents.push({
      id: "evt-1",
      nodeId: "n2",
      openedAt: T0,
      state: "unconfirmed",
      confirmedAt: null,
      resolvedAt: null,
      speciesLabel: null,
      leadSignalId: "sig-lead",
      confirmSignalId: null,
      firstDeliveryAt: null,
    });

    const sent = await harness.simulator.sendSecondSignal();

    expect(sent).toMatchObject({ eventId: "evt-1", nodeId: "n2", source: "thermal" });
    expect(harness.detections).toHaveLength(1);
    expect(harness.detections[0]).toMatchObject({
      nodeId: "n2",
      source: "thermal",
      confidence: 0.72,
    });
  });

  it("refuses a second signal when nothing is open", async () => {
    await expect(harness.simulator.sendSecondSignal()).rejects.toMatchObject({
      status: 409,
      code: "no_open_event",
    });
  });

  it("keeps the loop alive across transport failures and records the error", async () => {
    harness.simulator.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.heartbeats.length = 0;

    harness.failNextHeartbeat();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(harness.simulator.status().lastError).toContain("ingest unavailable");

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(harness.heartbeats.length).toBeGreaterThan(0);
    expect(harness.simulator.status().lastError).toBeNull();
  });

  it("stays silent in ambient mode when off, emits expiring chatter when on", async () => {
    harness.simulator.start();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 30);
    expect(harness.detections).toHaveLength(0);
    harness.simulator.stop();

    const ambient = createHarness({ ambient: true });
    ambient.simulator.start();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 30);
    expect(ambient.detections.length).toBeGreaterThan(0);
    for (const detection of ambient.detections) {
      expect(detection.confidence).toBeLessThan(0.5);
    }
    ambient.simulator.stop();
  });

  it("suspends ambient chatter while any event is open", async () => {
    const ambient = createHarness({ ambient: true });
    ambient.openEvents.push({
      id: "evt-open",
      nodeId: "n1",
      openedAt: T0,
      state: "unconfirmed",
      confirmedAt: null,
      resolvedAt: null,
      speciesLabel: null,
      leadSignalId: "sig-x",
      confirmSignalId: null,
      firstDeliveryAt: null,
    });
    ambient.simulator.start();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 30);
    expect(ambient.detections).toHaveLength(0);
    ambient.simulator.stop();
  });

  it("reset restores links, cancels scenarios and keeps running", async () => {
    harness.simulator.start();
    await vi.advanceTimersByTimeAsync(0);
    harness.simulator.killLink("n1");
    harness.simulator.runScenario("rail_crossing_confirmed");

    harness.simulator.reset();

    expect(harness.simulator.status()).toMatchObject({
      running: true,
      killedNodeIds: [],
      scenario: null,
    });
    harness.detections.length = 0;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(harness.detections).toHaveLength(0);
  });
});

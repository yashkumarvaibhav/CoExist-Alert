import { count } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as postDetection } from "@/app/api/ingest/detection/route";
import { POST as postHeartbeat } from "@/app/api/ingest/heartbeat/route";
import { createDatabaseClient } from "@/db/client";
import type { AppDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { resetRuntimeDatabase } from "@/db/runtime";
import { alerts, events, heartbeats, signals } from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type { Responder, SensorNode, VillagerZone } from "@/domain/types";
import type { FieldStreamEvent } from "@/stream/events";
import { resetStreamHub, streamHub } from "@/stream/hub";

const T0 = "2026-07-02T04:58:02.000Z";

function plusSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

const baseNode: SensorNode = {
  id: "n2",
  name: "Rail Crossing KM-47",
  kind: "rail_crossing",
  lat: 26.89,
  lng: 88.89,
  geofenceRadiusM: 2_200,
  status: "healthy",
  batteryPct: 86,
  linkQualityPct: 94,
  lastHeartbeatAt: T0,
  createdAt: "2026-06-02T00:00:00.000Z",
};

const nearbyZone: VillagerZone = {
  id: "zone-chalsa-basti",
  label: "Chalsa Basti",
  lat: 26.889,
  lng: 88.878,
};

const distantZone: VillagerZone = {
  id: "zone-distant-market",
  label: "Distant Market",
  lat: 26.934,
  lng: 88.964,
};

const tierOneGuard: Responder = {
  id: "guard-sharma",
  name: "Beat Officer R. Sharma",
  role: "guard",
  tier: 1,
  webexEmail: "r.sharma@example.test",
  phoneLabel: "Guard mobile",
  nodeIds: ["n2"],
};

const tierTwoGuard: Responder = {
  id: "guard-rrt-alpha",
  name: "Range RRT Alpha",
  role: "guard",
  tier: 2,
  webexEmail: "rrt.alpha@example.test",
  phoneLabel: "Rapid response phone",
  nodeIds: ["n2"],
};

const controlRoom: Responder = {
  id: "nfr-chalsa-control",
  name: "NFR Section Control - Chalsa",
  role: "control_room",
  tier: 1,
  webexEmail: null,
  phoneLabel: "Rail control desk",
  nodeIds: ["n2"],
};

function jsonRequest(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function collectStreamEvents(): { events: FieldStreamEvent[]; unsubscribe: () => void } {
  const events: FieldStreamEvent[] = [];
  const unsubscribe = streamHub.subscribe((event) => {
    events.push(event);
  });
  return { events, unsubscribe };
}

function channelOrder(channel: string): number {
  return ["siren", "villager_phone", "guard_webex", "control_room", "blindspot_ops"].indexOf(channel);
}

describe("ingest API routes", () => {
  let tempDir: string;
  let databasePath: string;

  function setupDatabase(seed?: (repos: ReturnType<typeof createRepositories>) => void): void {
    const client = createDatabaseClient({ path: databasePath });
    try {
      const repos = createRepositories(client.db);
      repos.settings.upsert(DEFAULT_SETTINGS);
      repos.nodes.upsert(baseNode);
      repos.villagerZones.upsert(nearbyZone);
      repos.villagerZones.upsert(distantZone);
      repos.responders.upsert(tierOneGuard);
      repos.responders.upsert(tierTwoGuard);
      repos.responders.upsert(controlRoom);
      seed?.(repos);
    } finally {
      client.close();
    }
  }

  function inspectDatabase<T>(read: (repos: ReturnType<typeof createRepositories>, db: AppDatabase) => T): T {
    resetRuntimeDatabase();
    const client = createDatabaseClient({ path: databasePath });
    try {
      return read(createRepositories(client.db), client.db);
    } finally {
      client.close();
    }
  }

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "coexist-ingest-"));
    databasePath = path.join(tempDir, "test.sqlite");
    process.env.COEXIST_DB_PATH = databasePath;
    resetRuntimeDatabase();
    resetStreamHub();
  });

  afterEach(() => {
    resetRuntimeDatabase();
    resetStreamHub();
    delete process.env.COEXIST_DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects malformed heartbeat bodies without persisting rows", async () => {
    setupDatabase();

    const response = await postHeartbeat(jsonRequest("/api/ingest/heartbeat", {
      nodeId: "n2",
      at: T0,
      batteryPct: 101,
      linkQualityPct: 90,
    }));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({
      error: { code: "invalid_request" },
    });
    expect(
      inspectDatabase((repos, db) => ({
        heartbeats: db.select({ value: count() }).from(heartbeats).get()?.value,
        node: repos.nodes.findById("n2"),
        alerts: db.select({ value: count() }).from(alerts).get()?.value,
      })),
    ).toEqual({
      heartbeats: 0,
      node: baseNode,
      alerts: 0,
    });
  });

  it("returns 404 for unknown heartbeat nodes without persisting rows", async () => {
    setupDatabase();

    const response = await postHeartbeat(jsonRequest("/api/ingest/heartbeat", {
      nodeId: "missing",
      at: plusSeconds(T0, 5),
      batteryPct: 90,
      linkQualityPct: 90,
    }));

    expect(response.status).toBe(404);
    expect(await readJson(response)).toMatchObject({
      error: { code: "node_not_found" },
    });
    expect(inspectDatabase((_, db) => db.select({ value: count() }).from(heartbeats).get()?.value)).toBe(0);
  });

  it("persists a heartbeat and records blind-spot recovery effects", async () => {
    setupDatabase();
    const collected = collectStreamEvents();

    const heartbeatAt = plusSeconds(T0, 41);
    const response = await postHeartbeat(jsonRequest("/api/ingest/heartbeat", {
      nodeId: "n2",
      at: heartbeatAt,
      batteryPct: 83,
      linkQualityPct: 88,
    }));

    expect(response.status).toBe(202);
    expect(await readJson(response)).toMatchObject({
      nodeId: "n2",
      status: "healthy",
      effects: {
        openOutage: true,
        closeOutage: true,
        fireBlindspotAlert: true,
      },
    });

    const persisted = inspectDatabase((repos) => ({
      node: repos.nodes.findById("n2"),
      heartbeats: repos.heartbeats.listForNode("n2"),
      outages: repos.outages.listForNode("n2"),
      blindspotAlerts: repos.alerts.listForOutage(repos.outages.listForNode("n2")[0]?.id ?? ""),
    }));

    expect(persisted.node).toMatchObject({
      status: "healthy",
      batteryPct: 83,
      linkQualityPct: 88,
      lastHeartbeatAt: heartbeatAt,
    });
    expect(persisted.heartbeats).toHaveLength(1);
    expect(persisted.outages).toHaveLength(1);
    expect(persisted.outages[0]).toMatchObject({
      nodeId: "n2",
      startedAt: heartbeatAt,
      endedAt: heartbeatAt,
      opsAlerted: true,
    });
    expect(persisted.blindspotAlerts).toHaveLength(1);
    expect(persisted.blindspotAlerts[0]).toMatchObject({
      eventId: null,
      outageId: persisted.outages[0].id,
      channel: "blindspot_ops",
      targetRef: "n2",
      status: "delivered",
      isLive: false,
    });
    expect(collected.events.map((event) => event.type)).toEqual([
      "node-status",
      "outage",
      "outage",
      "alert",
      "delivery",
    ]);
    expect(collected.events[1]).toMatchObject({
      type: "outage",
      payload: { endedAt: null },
    });
    expect(collected.events[2]).toMatchObject({
      type: "outage",
      payload: { endedAt: heartbeatAt },
    });
    expect(collected.events[3]).toMatchObject({
      type: "alert",
      payload: { channel: "blindspot_ops", status: "queued" },
    });
    expect(collected.events[4]).toMatchObject({
      type: "delivery",
      payload: { channel: "blindspot_ops", status: "delivered" },
    });
    collected.unsubscribe();
  });

  it("degrades a node on a low-battery heartbeat", async () => {
    setupDatabase();
    const collected = collectStreamEvents();

    const response = await postHeartbeat(jsonRequest("/api/ingest/heartbeat", {
      nodeId: "n2",
      at: plusSeconds(T0, 5),
      batteryPct: 12,
      linkQualityPct: 92,
    }));

    expect(response.status).toBe(202);
    expect(await readJson(response)).toMatchObject({
      nodeId: "n2",
      status: "degraded",
    });
    expect(inspectDatabase((repos) => repos.nodes.findById("n2")?.status)).toBe("degraded");
    expect(collected.events).toHaveLength(1);
    expect(collected.events[0]).toMatchObject({
      type: "node-status",
      payload: { nodeId: "n2", status: "degraded" },
    });
    collected.unsubscribe();
  });

  it("rejects malformed detection bodies without persisting rows", async () => {
    setupDatabase();

    const response = await postDetection(jsonRequest("/api/ingest/detection", {
      nodeId: "n2",
      at: T0,
      source: "camera",
      classification: "large_animal",
      confidence: -0.1,
    }));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({
      error: { code: "invalid_request" },
    });
    expect(
      inspectDatabase((_, db) => ({
        signals: db.select({ value: count() }).from(signals).get()?.value,
        events: db.select({ value: count() }).from(events).get()?.value,
      })),
    ).toEqual({ signals: 0, events: 0 });
  });

  it("opens an unconfirmed event for a weak first detection", async () => {
    setupDatabase();
    const collected = collectStreamEvents();

    const response = await postDetection(jsonRequest("/api/ingest/detection", {
      nodeId: "n2",
      at: T0,
      source: "camera",
      classification: "large_animal",
      confidence: 0.62,
      snapshotRef: "/demo-snapshots/n2-camera.svg",
    }));

    expect(response.status).toBe(202);
    const body = await readJson(response);
    expect(body).toMatchObject({
      eventState: "unconfirmed",
    });

    const persisted = inspectDatabase((repos) => ({
      event: repos.events.findById(body.eventId as string),
      signals: repos.signals.listForEvent(body.eventId as string),
      alerts: repos.alerts.listForEvent(body.eventId as string),
    }));
    expect(persisted.event).toMatchObject({
      nodeId: "n2",
      openedAt: T0,
      state: "unconfirmed",
      confirmedAt: null,
      speciesLabel: null,
    });
    expect(persisted.signals).toHaveLength(1);
    expect(persisted.signals[0]).toMatchObject({
      id: body.signalId,
      source: "camera",
      eventId: body.eventId,
    });
    expect(persisted.alerts).toEqual([]);
    expect(collected.events.map((event) => event.type)).toEqual(["signal", "event"]);
    expect(collected.events[1]).toMatchObject({
      type: "event",
      payload: { id: body.eventId, state: "unconfirmed" },
    });
    collected.unsubscribe();
  });

  it("confirms an open event with a second-source detection and dispatches tier-one alerts", async () => {
    setupDatabase();

    const first = await postDetection(jsonRequest("/api/ingest/detection", {
      nodeId: "n2",
      at: T0,
      source: "camera",
      classification: "large_animal",
      confidence: 0.62,
    }));
    const opened = await readJson(first);
    const collected = collectStreamEvents();

    const secondAt = plusSeconds(T0, 29);
    const second = await postDetection(jsonRequest("/api/ingest/detection", {
      nodeId: "n2",
      at: secondAt,
      source: "thermal",
      classification: "elephant_class",
      confidence: 0.7,
      snapshotRef: "/demo-snapshots/n2-thermal.svg",
    }));

    expect(second.status).toBe(202);
    const confirmed = await readJson(second);
    expect(confirmed).toMatchObject({
      eventId: opened.eventId,
      eventState: "confirmed",
    });

    const persisted = inspectDatabase((repos) => ({
      event: repos.events.findById(opened.eventId as string),
      signals: repos.signals.listForEvent(opened.eventId as string),
      alerts: repos.alerts.listForEvent(opened.eventId as string),
    }));
    const deliveredAtValues = persisted.alerts
      .map((alert) => alert.deliveredAt)
      .filter((value): value is string => value !== null)
      .sort();
    expect(persisted.event).toMatchObject({
      state: "confirmed",
      confirmedAt: secondAt,
      speciesLabel: "elephant_class",
      confirmSignalId: confirmed.signalId,
      firstDeliveryAt: deliveredAtValues[0],
    });
    expect(persisted.signals.map((signal) => signal.source)).toEqual(["camera", "thermal"]);
    expect(
      [...persisted.alerts].sort((a, b) => channelOrder(a.channel) - channelOrder(b.channel)).map((alert) => ({
        channel: alert.channel,
        targetRef: alert.targetRef,
        tier: alert.tier,
        status: alert.status,
        isLive: alert.isLive,
        outageId: alert.outageId,
      })),
    ).toEqual([
      {
        channel: "siren",
        targetRef: "n2",
        tier: 1,
        status: "delivered",
        isLive: false,
        outageId: null,
      },
      {
        channel: "villager_phone",
        targetRef: "zone-chalsa-basti",
        tier: 1,
        status: "delivered",
        isLive: false,
        outageId: null,
      },
      {
        channel: "guard_webex",
        targetRef: "guard-sharma",
        tier: 1,
        status: "delivered",
        isLive: false,
        outageId: null,
      },
      {
        channel: "control_room",
        targetRef: "nfr-chalsa-control",
        tier: 1,
        status: "delivered",
        isLive: false,
        outageId: null,
      },
    ]);
    expect(persisted.alerts.every((alert) => alert.sentAt !== null)).toBe(true);
    expect(persisted.alerts.every((alert) => alert.deliveredAt !== null)).toBe(true);
    expect(collected.events.slice(0, 2).map((event) => event.type)).toEqual([
      "signal",
      "event",
    ]);
    expect(collected.events.filter((event) => event.type === "alert")).toHaveLength(4);
    expect(collected.events.filter((event) => event.type === "delivery")).toHaveLength(4);
    expect(collected.events[1]).toMatchObject({
      type: "event",
      payload: { id: opened.eventId, state: "confirmed" },
    });
    collected.unsubscribe();
  });

  it("opens a confirmed event for a high-confidence detection", async () => {
    setupDatabase();

    const response = await postDetection(jsonRequest("/api/ingest/detection", {
      nodeId: "n2",
      at: T0,
      source: "camera",
      classification: "elephant_class",
      confidence: 0.91,
    }));

    expect(response.status).toBe(202);
    const body = await readJson(response);
    expect(body).toMatchObject({
      eventState: "confirmed",
    });
    expect(inspectDatabase((repos) => repos.events.findById(body.eventId as string))).toMatchObject({
      state: "confirmed",
      confirmedAt: T0,
      speciesLabel: "elephant_class",
      leadSignalId: body.signalId,
      confirmSignalId: null,
      firstDeliveryAt: expect.any(String),
    });
    expect(inspectDatabase((repos) => repos.alerts.listForEvent(body.eventId as string))).toHaveLength(4);
  });

  it("expires stale unconfirmed events before re-processing the new detection", async () => {
    setupDatabase();

    const first = await postDetection(jsonRequest("/api/ingest/detection", {
      nodeId: "n2",
      at: T0,
      source: "camera",
      classification: "large_animal",
      confidence: 0.62,
    }));
    const stale = await readJson(first);

    const second = await postDetection(jsonRequest("/api/ingest/detection", {
      nodeId: "n2",
      at: plusSeconds(T0, 46),
      source: "thermal",
      classification: "elephant_class",
      confidence: 0.7,
    }));

    expect(second.status).toBe(202);
    const fresh = await readJson(second);
    expect(fresh).toMatchObject({
      eventState: "unconfirmed",
    });
    expect(fresh.eventId).not.toBe(stale.eventId);

    const persisted = inspectDatabase((repos) => ({
      stale: repos.events.findById(stale.eventId as string),
      fresh: repos.events.findById(fresh.eventId as string),
      freshSignals: repos.signals.listForEvent(fresh.eventId as string),
      staleAlerts: repos.alerts.listForEvent(stale.eventId as string),
      freshAlerts: repos.alerts.listForEvent(fresh.eventId as string),
    }));

    expect(persisted.stale).toMatchObject({ state: "expired" });
    expect(persisted.fresh).toMatchObject({
      state: "unconfirmed",
      leadSignalId: fresh.signalId,
    });
    expect(persisted.freshSignals).toHaveLength(1);
    expect(persisted.staleAlerts).toEqual([]);
    expect(persisted.freshAlerts).toEqual([]);
  });
});

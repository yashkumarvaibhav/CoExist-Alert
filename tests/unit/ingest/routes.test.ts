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
import { events, heartbeats, signals } from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type { SensorNode } from "@/domain/types";

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

describe("ingest API routes", () => {
  let tempDir: string;
  let databasePath: string;

  function setupDatabase(seed?: (repos: ReturnType<typeof createRepositories>) => void): void {
    const client = createDatabaseClient({ path: databasePath });
    try {
      const repos = createRepositories(client.db);
      repos.settings.upsert(DEFAULT_SETTINGS);
      repos.nodes.upsert(baseNode);
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
  });

  afterEach(() => {
    resetRuntimeDatabase();
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
      })),
    ).toEqual({
      heartbeats: 0,
      node: baseNode,
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
  });

  it("degrades a node on a low-battery heartbeat", async () => {
    setupDatabase();

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
  });

  it("confirms an open event with a second-source detection", async () => {
    setupDatabase();

    const first = await postDetection(jsonRequest("/api/ingest/detection", {
      nodeId: "n2",
      at: T0,
      source: "camera",
      classification: "large_animal",
      confidence: 0.62,
    }));
    const opened = await readJson(first);

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
    }));
    expect(persisted.event).toMatchObject({
      state: "confirmed",
      confirmedAt: secondAt,
      speciesLabel: "elephant_class",
      confirmSignalId: confirmed.signalId,
    });
    expect(persisted.signals.map((signal) => signal.source)).toEqual(["camera", "thermal"]);
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
    });
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
    }));

    expect(persisted.stale).toMatchObject({ state: "expired" });
    expect(persisted.fresh).toMatchObject({
      state: "unconfirmed",
      leadSignalId: fresh.signalId,
    });
    expect(persisted.freshSignals).toHaveLength(1);
  });
});

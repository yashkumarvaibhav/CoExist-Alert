import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as postScenario } from "@/app/api/demo/scenario/route";
import { GET as getHealth } from "@/app/api/health/route";
import { createDatabaseClient } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { resetRuntimeDatabase } from "@/db/runtime";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type { SensorNode } from "@/domain/types";
import { runFieldSweep } from "@/sim/boot";
import { resetSimulator } from "@/sim/runtime";
import type { FieldStreamEvent } from "@/stream/events";
import { resetStreamHub, streamHub } from "@/stream/hub";

const T0 = "2026-07-02T04:58:02.000Z";

function plusSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

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
    // Ahead of the scenario clock so health sweeps stay quiet in these tests.
    lastHeartbeatAt: plusSeconds(T0, 60),
    createdAt: "2026-06-02T00:00:00.000Z",
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/demo/scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("POST /api/demo/scenario", () => {
  let tempDir: string;
  let databasePath: string;

  function seedField(): void {
    const client = createDatabaseClient({ path: databasePath });
    try {
      const repos = createRepositories(client.db);
      repos.settings.upsert(DEFAULT_SETTINGS);
      repos.nodes.upsert(makeNode("n1", "village_boundary"));
      repos.nodes.upsert(makeNode("n2", "rail_crossing"));
      repos.nodes.upsert(makeNode("n3", "waterhole"));
    } finally {
      client.close();
    }
  }

  function inspect<T>(read: (repos: ReturnType<typeof createRepositories>) => T): T {
    const client = createDatabaseClient({ path: databasePath });
    try {
      return read(createRepositories(client.db));
    } finally {
      client.close();
    }
  }

  function collectStreamEvents(): FieldStreamEvent[] {
    const collected: FieldStreamEvent[] = [];
    streamHub.subscribe((event) => {
      collected.push(event);
    });
    return collected;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T0));
    tempDir = mkdtempSync(path.join(tmpdir(), "coexist-demo-"));
    databasePath = path.join(tempDir, "test.sqlite");
    process.env.COEXIST_DB_PATH = databasePath;
    resetRuntimeDatabase();
    resetStreamHub();
    resetSimulator();
    seedField();
  });

  afterEach(() => {
    resetSimulator();
    resetRuntimeDatabase();
    resetStreamHub();
    delete process.env.COEXIST_DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it("drives the rail preset through ingest to a confirmed event with SSE traffic", async () => {
    const collected = collectStreamEvents();

    const response = await postScenario(
      jsonRequest({ action: "trigger_detection", preset: "rail_crossing_confirmed" }),
    );
    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      ok: true,
      scheduled: { preset: "rail_crossing_confirmed", nodeId: "n2", steps: 2 },
    });

    await vi.advanceTimersByTimeAsync(0);
    const opened = inspect((repos) => repos.events.listOpen());
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ nodeId: "n2", state: "unconfirmed" });

    await vi.advanceTimersByTimeAsync(4_000);
    const confirmed = inspect((repos) => repos.events.findById(opened[0].id));
    expect(confirmed).toMatchObject({
      state: "confirmed",
      speciesLabel: "elephant_class",
      confirmedAt: plusSeconds(T0, 4),
      firstDeliveryAt: "2026-07-02T04:58:07.500Z",
    });
    const signals = inspect((repos) => repos.signals.listForEvent(opened[0].id));
    expect(signals.map((signal) => signal.source)).toEqual(["camera", "thermal"]);
    const alerts = inspect((repos) => repos.alerts.listForEvent(opened[0].id));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      channel: "siren",
      targetRef: "n2",
      status: "delivered",
      deliveredAt: "2026-07-02T04:58:07.500Z",
      isLive: false,
    });

    expect(collected.map((event) => event.type)).toEqual([
      "signal",
      "event",
      "signal",
      "event",
      "alert",
      "delivery",
    ]);
    expect(collected[3]).toMatchObject({
      type: "event",
      payload: { id: opened[0].id, state: "confirmed" },
    });
  });

  it("lets the weak signal expire through the field sweep", async () => {
    const response = await postScenario(
      jsonRequest({ action: "trigger_detection", preset: "weak_signal_expires" }),
    );
    expect(response.status).toBe(200);

    await vi.advanceTimersByTimeAsync(0);
    const opened = inspect((repos) => repos.events.listOpen());
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ nodeId: "n3", state: "unconfirmed" });

    const collected = collectStreamEvents();
    vi.setSystemTime(new Date(plusSeconds(T0, 46)));
    await runFieldSweep();

    expect(inspect((repos) => repos.events.findById(opened[0].id))).toMatchObject({
      state: "expired",
    });
    expect(collected.map((event) => event.type)).toEqual(["event"]);
    expect(collected[0]).toMatchObject({
      type: "event",
      payload: { id: opened[0].id, state: "expired" },
    });
  });

  it("confirms an open event via the second_signal action", async () => {
    await postScenario(
      jsonRequest({ action: "trigger_detection", preset: "weak_signal_expires" }),
    );
    await vi.advanceTimersByTimeAsync(0);
    const opened = inspect((repos) => repos.events.listOpen());

    const response = await postScenario(jsonRequest({ action: "second_signal" }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      ok: true,
      sent: { eventId: opened[0].id, nodeId: "n3" },
    });
    expect(inspect((repos) => repos.events.findById(opened[0].id))).toMatchObject({
      state: "confirmed",
    });
  });

  it("returns 409 for second_signal when nothing is open", async () => {
    const response = await postScenario(jsonRequest({ action: "second_signal" }));

    expect(response.status).toBe(409);
    expect(await readJson(response)).toMatchObject({
      error: { code: "no_open_event" },
    });
  });

  it("kills and restores a node link with validation", async () => {
    const missingId = await postScenario(jsonRequest({ action: "kill_link" }));
    expect(missingId.status).toBe(400);
    expect(await readJson(missingId)).toMatchObject({
      error: { code: "node_id_required" },
    });

    const unknown = await postScenario(
      jsonRequest({ action: "kill_link", nodeId: "n9" }),
    );
    expect(unknown.status).toBe(404);

    const killed = await postScenario(jsonRequest({ action: "kill_link", nodeId: "n3" }));
    expect(killed.status).toBe(200);
    expect(await readJson(killed)).toMatchObject({
      state: { killedNodeIds: ["n3"] },
    });

    const restored = await postScenario(
      jsonRequest({ action: "restore_link", nodeId: "n3" }),
    );
    expect(restored.status).toBe(200);
    expect(await readJson(restored)).toMatchObject({
      state: { killedNodeIds: [] },
    });
  });

  it("rejects trigger_detection without a preset", async () => {
    const response = await postScenario(jsonRequest({ action: "trigger_detection" }));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({
      error: { code: "preset_required" },
    });
  });

  it("rejects unknown actions and unknown presets", async () => {
    const badAction = await postScenario(jsonRequest({ action: "explode" }));
    expect(badAction.status).toBe(400);

    const badPreset = await postScenario(
      jsonRequest({ action: "trigger_detection", preset: "volcano" }),
    );
    expect(badPreset.status).toBe(400);
  });

  it("reset clears killed links and pending scenarios", async () => {
    await postScenario(jsonRequest({ action: "kill_link", nodeId: "n1" }));
    await postScenario(
      jsonRequest({ action: "trigger_detection", preset: "rail_crossing_confirmed" }),
    );

    const response = await postScenario(jsonRequest({ action: "reset" }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      state: { killedNodeIds: [], scenario: null },
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(inspect((repos) => repos.events.listOpen())).toEqual([]);
  });

  it("surfaces the simulator in /api/health once provisioned", async () => {
    await postScenario(jsonRequest({ action: "reset" }));

    const response = getHealth();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      simulator: { status: "idle", ambient: false, killedNodeIds: [] },
    });
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabaseClient } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { resetRuntimeDatabase } from "@/db/runtime";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type { SensorNode } from "@/domain/types";
import { SWEEP_INTERVAL_MS, resetFieldRuntime, startFieldRuntime } from "@/sim/boot";
import { resetSimulator, simulatorHealth } from "@/sim/runtime";
import type { FieldStreamEvent } from "@/stream/events";
import { resetStreamHub, streamHub } from "@/stream/hub";

const T0 = "2026-07-02T04:58:02.000Z";

function staleNode(): SensorNode {
  return {
    id: "n2",
    name: "Rail Crossing KM-47",
    kind: "rail_crossing",
    lat: 26.89,
    lng: 88.89,
    geofenceRadiusM: 2_200,
    status: "healthy",
    batteryPct: 86,
    linkQualityPct: 94,
    // Hours of silence before boot: the server was down, the node went dark.
    lastHeartbeatAt: T0,
    createdAt: "2026-06-02T00:00:00.000Z",
  };
}

describe("startFieldRuntime", () => {
  let tempDir: string;
  let databasePath: string;
  let originalAutostart: string | undefined;

  function inspect<T>(read: (repos: ReturnType<typeof createRepositories>) => T): T {
    const client = createDatabaseClient({ path: databasePath });
    try {
      return read(createRepositories(client.db));
    } finally {
      client.close();
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T08:00:00.000Z"));
    tempDir = mkdtempSync(path.join(tmpdir(), "coexist-boot-"));
    databasePath = path.join(tempDir, "test.sqlite");
    process.env.COEXIST_DB_PATH = databasePath;
    originalAutostart = process.env.COEXIST_SIM_AUTOSTART;
    resetRuntimeDatabase();
    resetStreamHub();
    resetSimulator();
    resetFieldRuntime();

    const client = createDatabaseClient({ path: databasePath });
    try {
      const repos = createRepositories(client.db);
      repos.settings.upsert(DEFAULT_SETTINGS);
      repos.nodes.upsert(staleNode());
    } finally {
      client.close();
    }
  });

  afterEach(() => {
    resetFieldRuntime();
    resetSimulator();
    resetRuntimeDatabase();
    resetStreamHub();
    if (originalAutostart === undefined) {
      delete process.env.COEXIST_SIM_AUTOSTART;
    } else {
      process.env.COEXIST_SIM_AUTOSTART = originalAutostart;
    }
    delete process.env.COEXIST_DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it("recovers heartbeat-timeout state from the DB at boot", async () => {
    process.env.COEXIST_SIM_AUTOSTART = "0";
    const collected: FieldStreamEvent[] = [];
    streamHub.subscribe((event) => {
      collected.push(event);
    });

    await startFieldRuntime();

    expect(inspect((repos) => repos.nodes.findById("n2"))).toMatchObject({
      status: "offline",
    });
    const outages = inspect((repos) => repos.outages.listForNode("n2"));
    expect(outages).toHaveLength(1);
    expect(outages[0]).toMatchObject({ endedAt: null, opsAlerted: true });
    expect(inspect((repos) => repos.alerts.listForOutage(outages[0].id))).toHaveLength(1);
    expect(collected.map((event) => event.type)).toEqual([
      "node-status",
      "outage",
      "alert",
      "delivery",
    ]);

    // Idempotent: a second boot call must not double anything.
    await startFieldRuntime();
    expect(inspect((repos) => repos.outages.listForNode("n2"))).toHaveLength(1);
    expect(inspect((repos) => repos.alerts.listForOutage(outages[0].id))).toHaveLength(1);
    expect(collected).toHaveLength(4);
  });

  it("keeps sweeping on the interval after boot", async () => {
    process.env.COEXIST_SIM_AUTOSTART = "0";
    await startFieldRuntime();

    // Recovery via a fresh heartbeat is the ingest path; here assert the
    // interval keeps evaluating: still exactly one open outage, no errors.
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS * 3);
    const outages = inspect((repos) => repos.outages.listForNode("n2"));
    expect(outages).toHaveLength(1);
    expect(outages[0]).toMatchObject({ endedAt: null });
  });

  it("starts the simulator loop by default and honours the autostart flag", async () => {
    delete process.env.COEXIST_SIM_AUTOSTART;
    await startFieldRuntime();
    expect(simulatorHealth()).toMatchObject({ status: "running" });

    // The loop drives real heartbeats through ingest, recovering the node.
    await vi.advanceTimersByTimeAsync(0);
    expect(inspect((repos) => repos.nodes.findById("n2"))).toMatchObject({
      status: "healthy",
    });
    expect(
      inspect((repos) => repos.heartbeats.listForNode("n2")).length,
    ).toBeGreaterThan(0);
    expect(inspect((repos) => repos.outages.listForNode("n2"))[0]).toMatchObject({
      endedAt: "2026-07-02T08:00:00.000Z",
    });

    resetFieldRuntime();
    resetSimulator();
    process.env.COEXIST_SIM_AUTOSTART = "0";
    await startFieldRuntime();
    expect(simulatorHealth()).toMatchObject({ status: "idle" });
  });
});

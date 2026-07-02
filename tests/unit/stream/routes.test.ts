import { count } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as getHealth } from "@/app/api/health/route";
import { GET as getStream } from "@/app/api/stream/route";
import { createDatabaseClient } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { resetRuntimeDatabase } from "@/db/runtime";
import { nodes } from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type { SensorNode, Signal } from "@/domain/types";
import { resetStreamHub, streamHub } from "@/stream/hub";

const T0 = "2026-07-02T04:58:02.000Z";

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

describe("stream and health routes", () => {
  let tempDir: string;
  let databasePath: string;
  let originalWebexToken: string | undefined;
  let originalWebexRoom: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "coexist-stream-"));
    databasePath = path.join(tempDir, "test.sqlite");
    process.env.COEXIST_DB_PATH = databasePath;
    originalWebexToken = process.env.WEBEX_BOT_TOKEN;
    originalWebexRoom = process.env.WEBEX_ROOM_ID;
    delete process.env.WEBEX_BOT_TOKEN;
    delete process.env.WEBEX_ROOM_ID;
    resetRuntimeDatabase();
    resetStreamHub();
  });

  afterEach(() => {
    resetRuntimeDatabase();
    resetStreamHub();
    if (originalWebexToken === undefined) {
      delete process.env.WEBEX_BOT_TOKEN;
    } else {
      process.env.WEBEX_BOT_TOKEN = originalWebexToken;
    }
    if (originalWebexRoom === undefined) {
      delete process.env.WEBEX_ROOM_ID;
    } else {
      process.env.WEBEX_ROOM_ID = originalWebexRoom;
    }
    delete process.env.COEXIST_DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns an SSE response and writes published hub events", async () => {
    const abort = new AbortController();
    const response = getStream(new Request("http://localhost/api/stream", {
      signal: abort.signal,
    }));

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const connected = await reader.read();
    expect(decoder.decode(connected.value)).toBe(": connected\n\n");
    expect(streamHub.listenerCount()).toBe(1);

    streamHub.publish({ type: "signal", at: T0, payload: signal });
    const streamed = await reader.read();
    const chunk = decoder.decode(streamed.value);
    expect(chunk).toContain("event: signal");
    expect(chunk).toContain("\"classification\":\"large_animal\"");

    abort.abort();
    await Promise.resolve();
    expect(streamHub.listenerCount()).toBe(0);
  });

  it("reports DB, simulator and Webex readiness", async () => {
    const client = createDatabaseClient({ path: databasePath });
    try {
      const repos = createRepositories(client.db);
      repos.settings.upsert(DEFAULT_SETTINGS);
      repos.nodes.upsert(baseNode);
      expect(client.db.select({ value: count() }).from(nodes).get()?.value).toBe(1);
    } finally {
      client.close();
    }

    const response = getHealth();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      db: { status: "ok", nodes: 1 },
      simulator: { status: "not_started" },
      webex: "simulated",
    });
  });
});

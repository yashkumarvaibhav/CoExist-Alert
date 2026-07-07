import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as exportEvents } from "@/app/api/export/events.ndjson/route";
import { createDatabaseClient } from "@/db/client";
import { resetRuntimeDatabase } from "@/db/runtime";
import { seedDatabase } from "@/db/seed";
import { analyticsWindow } from "@/lib/analytics";

describe("GET /api/export/events.ndjson", () => {
  let tempDir: string;
  let databasePath: string;
  let seededEvents: number;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "coexist-export-"));
    databasePath = path.join(tempDir, "test.sqlite");
    process.env.COEXIST_DB_PATH = databasePath;
    resetRuntimeDatabase();
    const client = createDatabaseClient({ path: databasePath });
    try {
      seededEvents = seedDatabase(client.db).events;
    } finally {
      client.close();
    }
  });

  afterEach(() => {
    resetRuntimeDatabase();
    delete process.env.COEXIST_DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("streams one newline-delimited JSON record per event with the honest export headers", async () => {
    const response = exportEvents(
      new Request("http://localhost/api/export/events.ndjson"),
    );

    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("content-disposition")).toContain("coexist-events.ndjson");
    expect(response.headers.get("x-coexist-export")).toBe("simulated-field-log");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.text();
    expect(body.endsWith("\n")).toBe(true);

    const lines = body.split("\n").filter((line) => line.length > 0);
    expect(lines.length).toBe(seededEvents);
    expect(seededEvents).toBeGreaterThan(0);

    const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    for (const record of records) {
      expect(typeof record.event_id).toBe("string");
      expect(typeof record.node_id).toBe("string");
      expect(typeof record.state).toBe("string");
      expect(typeof record.opened_at).toBe("string");
      expect(record).toHaveProperty("lead_time_seconds");
      expect(Array.isArray(record.channels)).toBe(true);
    }

    // The seed carries both confirmed-and-delivered events and expired suppressions.
    const delivered = records.find(
      (record) => record.confirmed === true && (record.alerts_total as number) > 0,
    );
    expect(delivered).toBeDefined();
    expect(typeof delivered?.lead_time_seconds).toBe("number");

    const suppressed = records.find(
      (record) => record.confirmed === false && (record.alerts_total as number) === 0,
    );
    expect(suppressed).toBeDefined();
    expect(suppressed?.lead_time_seconds).toBeNull();
  });

  it("filters the export to the requested analytics window", async () => {
    const fullResponse = exportEvents(
      new Request("http://localhost/api/export/events.ndjson"),
    );
    const windowedResponse = exportEvents(
      new Request("http://localhost/api/export/events.ndjson?window=7d"),
    );

    const fullRecords = (await fullResponse.text())
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const windowedRecords = (await windowedResponse.text())
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(windowedRecords.length).toBeGreaterThan(0);
    expect(windowedRecords.length).toBeLessThan(fullRecords.length);

    const cutoff = new Date(analyticsWindow("7d").fromIso).getTime();
    expect(
      fullRecords.some(
        (record) => new Date(record.opened_at as string).getTime() < cutoff,
      ),
    ).toBe(true);
    expect(
      windowedRecords.every(
        (record) => new Date(record.opened_at as string).getTime() >= cutoff,
      ),
    ).toBe(true);
  });
});

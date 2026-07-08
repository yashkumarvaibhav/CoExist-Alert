import { describe, expect, it } from "vitest";

import { createInMemoryDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { readSeedSummary, seedDatabase } from "@/db/seed";
import { istHourOfDay } from "@/domain/metrics";

describe("demo seed", () => {
  it("is idempotent and creates the Dooars corridor demo dataset", () => {
    const database = createInMemoryDatabase();

    try {
      const first = seedDatabase(database.db);
      const second = seedDatabase(database.db);
      const fromDatabase = readSeedSummary(database.db);

      expect(second).toEqual(first);
      expect(fromDatabase).toEqual(first);
      expect(first).toEqual({
        nodes: 3,
        villagerZones: 5,
        responders: 4,
        heartbeats: 72,
        signals: 66,
        events: 36,
        alerts: 100,
        responses: 90,
        outages: 3,
        users: 5,
      });

      const repos = createRepositories(database.db);
      expect(repos.nodes.list().map((node) => node.name)).toEqual([
        "Village Boundary East",
        "Rail Crossing KM-47",
        "Waterhole 7",
      ]);
      expect(repos.villagerZones.list().map((zone) => zone.label)).toContain(
        "Distant Market",
      );

      const events = repos.events.list();
      const confirmed = events.filter((event) => event.confirmedAt !== null);
      const expired = events.filter((event) => event.state === "expired");

      expect(confirmed).toHaveLength(30);
      expect(expired).toHaveLength(6);

      const confirmedHours = confirmed.map((event) => istHourOfDay(event.confirmedAt!));
      expect(new Set(confirmedHours)).toEqual(new Set([5, 18]));
      expect(confirmed.filter((event) => event.nodeId === "n2")).toHaveLength(16);
    } finally {
      database.close();
    }
  });

  it("anchors the demo history to the current date so analytics stay populated", () => {
    const database = createInMemoryDatabase();

    try {
      seedDatabase(database.db);
      const repos = createRepositories(database.db);
      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;

      const events = repos.events.list();
      const openedTimes = events.map((event) => new Date(event.openedAt).getTime());
      // The whole history is in the past — the seed must never mint future events.
      expect(Math.max(...openedTimes)).toBeLessThan(now);
      // The newest event is fresh (yesterday's dawn/dusk) and the oldest keeps the
      // full month inside the default 30d analytics window, whenever the seed runs.
      expect(now - Math.max(...openedTimes)).toBeLessThan(2 * DAY_MS);
      expect(now - Math.min(...openedTimes)).toBeLessThan(32 * DAY_MS);

      // The e2e suite deep-links this event; its id must stay stable.
      expect(events.map((event) => event.id)).toContain("hist-01-n2");

      // Nodes report a just-now heartbeat so the health board starts green.
      for (const node of repos.nodes.list()) {
        expect(now - new Date(node.lastHeartbeatAt!).getTime()).toBeLessThan(5 * 60 * 1000);
      }
    } finally {
      database.close();
    }
  });
});

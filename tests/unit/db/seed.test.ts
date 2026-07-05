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
});

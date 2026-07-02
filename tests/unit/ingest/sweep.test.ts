import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type { IncursionEvent, SensorNode, Signal } from "@/domain/types";
import { sweepFieldState } from "@/ingest/service";

const T0 = "2026-07-02T04:58:02.000Z";

function plusSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

function makeNode(overrides: Partial<SensorNode> = {}): SensorNode {
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
    lastHeartbeatAt: T0,
    createdAt: "2026-06-02T00:00:00.000Z",
    ...overrides,
  };
}

function makeLeadSignal(nodeId: string, eventId: string, at: string): Signal {
  return {
    id: `${eventId}-lead`,
    nodeId,
    at,
    source: "camera",
    classification: "large_animal",
    confidence: 0.62,
    snapshotPath: null,
    eventId: null,
  };
}

/** Signals and events reference each other, so insert unattached then link. */
function insertOpenEvent(
  repos: ReturnType<typeof createRepositories>,
  event: IncursionEvent,
): void {
  repos.signals.insert(makeLeadSignal(event.nodeId, event.id, event.openedAt));
  repos.events.insert(event);
  repos.signals.attachToEvent(event.leadSignalId, event.id);
}

function makeOpenEvent(
  nodeId: string,
  openedAt: string,
  overrides: Partial<IncursionEvent> = {},
): IncursionEvent {
  const id = overrides.id ?? `evt-${nodeId}`;
  return {
    id,
    nodeId,
    openedAt,
    state: "unconfirmed",
    confirmedAt: null,
    resolvedAt: null,
    speciesLabel: null,
    leadSignalId: `${id}-lead`,
    confirmSignalId: null,
    firstDeliveryAt: null,
    ...overrides,
  };
}

describe("sweepFieldState", () => {
  let tempDir: string;
  let client: ReturnType<typeof createDatabaseClient>;
  let repos: ReturnType<typeof createRepositories>;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "coexist-sweep-"));
    client = createDatabaseClient({ path: path.join(tempDir, "test.sqlite") });
    repos = createRepositories(client.db);
    repos.settings.upsert(DEFAULT_SETTINGS);
  });

  afterEach(() => {
    client.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("does nothing for fresh nodes and absent events", () => {
    repos.nodes.upsert(makeNode());

    const outcome = sweepFieldState(repos, plusSeconds(T0, 5));

    expect(outcome.streamEvents).toEqual([]);
    expect(outcome.statusChanges).toEqual([]);
    expect(outcome.expiredEventIds).toEqual([]);
    expect(repos.nodes.findById("n2")?.status).toBe("healthy");
    expect(repos.outages.listForNode("n2")).toEqual([]);
  });

  it("degrades an overdue node without opening an outage", () => {
    repos.nodes.upsert(makeNode());

    // degradedAfterMissed=2 at 10s interval: overdue from 20s.
    const outcome = sweepFieldState(repos, plusSeconds(T0, 25));

    expect(outcome.statusChanges).toEqual([{ nodeId: "n2", status: "degraded" }]);
    expect(outcome.outageIds).toEqual([]);
    expect(repos.nodes.findById("n2")?.status).toBe("degraded");
    expect(repos.outages.listForNode("n2")).toEqual([]);
    expect(outcome.streamEvents.map((event) => event.type)).toEqual(["node-status"]);
    expect(outcome.streamEvents[0]).toMatchObject({
      type: "node-status",
      payload: { nodeId: "n2", status: "degraded" },
    });
  });

  it("takes a dark node offline, opens one outage and flags the blindspot alert", () => {
    repos.nodes.upsert(makeNode());

    // offlineAfterMissed=4 at 10s interval: offline from 40s.
    const nowIso = plusSeconds(T0, 41);
    const outcome = sweepFieldState(repos, nowIso);

    expect(outcome.statusChanges).toEqual([{ nodeId: "n2", status: "offline" }]);
    expect(outcome.outageIds).toHaveLength(1);
    expect(repos.nodes.findById("n2")?.status).toBe("offline");

    const outages = repos.outages.listForNode("n2");
    expect(outages).toHaveLength(1);
    expect(outages[0]).toMatchObject({
      nodeId: "n2",
      startedAt: nowIso,
      endedAt: null,
      opsAlerted: true,
    });
    expect(outcome.streamEvents.map((event) => event.type)).toEqual([
      "node-status",
      "outage",
    ]);

    // A second sweep is idempotent: still offline, no duplicate outage.
    const again = sweepFieldState(repos, plusSeconds(T0, 60));
    expect(again.statusChanges).toEqual([]);
    expect(again.outageIds).toEqual([]);
    expect(again.streamEvents).toEqual([]);
    expect(repos.outages.listForNode("n2")).toHaveLength(1);
  });

  it("never evaluates nodes that have not sent a heartbeat yet", () => {
    repos.nodes.upsert(
      makeNode({ id: "n9", lastHeartbeatAt: null, status: "healthy", batteryPct: null }),
    );

    const outcome = sweepFieldState(repos, plusSeconds(T0, 3_600));

    expect(outcome.statusChanges).toEqual([]);
    expect(repos.outages.listForNode("n9")).toEqual([]);
  });

  it("expires an unconfirmed event past the confirmation window", () => {
    repos.nodes.upsert(makeNode({ lastHeartbeatAt: plusSeconds(T0, 40) }));
    const event = makeOpenEvent("n2", T0);
    insertOpenEvent(repos, event);

    // Window is inclusive at the edge: 45s exactly must NOT expire.
    const atEdge = sweepFieldState(repos, plusSeconds(T0, 45));
    expect(atEdge.expiredEventIds).toEqual([]);
    expect(repos.events.findById(event.id)?.state).toBe("unconfirmed");

    const past = sweepFieldState(repos, plusSeconds(T0, 46));
    expect(past.expiredEventIds).toEqual([event.id]);
    expect(repos.events.findById(event.id)?.state).toBe("expired");
    expect(past.streamEvents.map((entry) => entry.type)).toEqual(["event"]);
    expect(past.streamEvents[0]).toMatchObject({
      type: "event",
      payload: { id: event.id, state: "expired" },
    });

    // Expiry fires once; later sweeps leave the event alone.
    const after = sweepFieldState(repos, plusSeconds(T0, 90));
    expect(after.expiredEventIds).toEqual([]);
  });

  it("leaves confirmed events untouched however old they are", () => {
    repos.nodes.upsert(makeNode({ lastHeartbeatAt: plusSeconds(T0, 3_600) }));
    const event = makeOpenEvent("n2", T0, {
      state: "confirmed",
      confirmedAt: plusSeconds(T0, 20),
      speciesLabel: "elephant_class",
    });
    insertOpenEvent(repos, event);

    const outcome = sweepFieldState(repos, plusSeconds(T0, 3_600));

    expect(outcome.expiredEventIds).toEqual([]);
    expect(repos.events.findById(event.id)?.state).toBe("confirmed");
  });

  it("sweeps every node and open event in one pass", () => {
    repos.nodes.upsert(makeNode()); // goes offline
    repos.nodes.upsert(
      makeNode({ id: "n1", name: "Village Boundary East", kind: "village_boundary", lastHeartbeatAt: plusSeconds(T0, 100) }),
    ); // stays healthy
    const stale = makeOpenEvent("n1", T0, { id: "evt-stale" });
    insertOpenEvent(repos, stale);

    const outcome = sweepFieldState(repos, plusSeconds(T0, 105));

    expect(outcome.statusChanges).toEqual([{ nodeId: "n2", status: "offline" }]);
    expect(outcome.expiredEventIds).toEqual(["evt-stale"]);
    expect(outcome.streamEvents.map((event) => event.type).sort()).toEqual([
      "event",
      "node-status",
      "outage",
    ]);
  });
});

describe("events.listOpen repository", () => {
  let tempDir: string;
  let client: ReturnType<typeof createDatabaseClient>;
  let repos: ReturnType<typeof createRepositories>;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "coexist-listopen-"));
    client = createDatabaseClient({ path: path.join(tempDir, "test.sqlite") });
    repos = createRepositories(client.db);
    repos.settings.upsert(DEFAULT_SETTINGS);
    repos.nodes.upsert(makeNode());
  });

  afterEach(() => {
    client.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns open events in openedAt order and skips terminal states", () => {
    const insert = (id: string, openedAt: string, state: IncursionEvent["state"]) => {
      insertOpenEvent(repos, makeOpenEvent("n2", openedAt, { id, state }));
    };
    insert("evt-b", plusSeconds(T0, 10), "confirmed");
    insert("evt-a", T0, "unconfirmed");
    insert("evt-x", plusSeconds(T0, 20), "expired");
    insert("evt-r", plusSeconds(T0, 30), "resolved");
    insert("evt-c", plusSeconds(T0, 40), "responding");

    expect(repos.events.listOpen().map((event) => event.id)).toEqual([
      "evt-a",
      "evt-b",
      "evt-c",
    ]);
  });
});

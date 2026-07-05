import { count } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as postEventResponse } from "@/app/api/events/[id]/respond/route";
import { createDatabaseClient } from "@/db/client";
import type { AppDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { resetRuntimeDatabase } from "@/db/runtime";
import { responses } from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type { IncursionEvent, Responder, SensorNode, Signal } from "@/domain/types";
import { resetEscalationRuntime, scheduleEscalationForEvent, scheduledEscalationDueAt } from "@/escalation/runtime";
import type { FieldStreamEvent } from "@/stream/events";
import { resetStreamHub, streamHub } from "@/stream/hub";

const T0 = "2026-07-02T04:58:31.000Z";

const node: SensorNode = {
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

const responder: Responder = {
  id: "guard-sharma",
  name: "Beat Officer R. Sharma",
  role: "guard",
  tier: 1,
  webexEmail: "r.sharma@example.test",
  phoneLabel: "Guard mobile",
  nodeIds: ["n2"],
};

const leadSignal: Signal = {
  id: "sig-lead",
  nodeId: "n2",
  at: "2026-07-02T04:58:02.000Z",
  source: "camera",
  classification: "large_animal",
  confidence: 0.62,
  snapshotPath: "/demo-snapshots/n2-camera.svg",
  eventId: "evt-1",
};

const event: IncursionEvent = {
  id: "evt-1",
  nodeId: "n2",
  openedAt: leadSignal.at,
  state: "confirmed",
  confirmedAt: T0,
  resolvedAt: null,
  speciesLabel: "elephant_class",
  leadSignalId: leadSignal.id,
  confirmSignalId: null,
  firstDeliveryAt: null,
};

function plusSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/events/evt-1/respond", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function collectStreamEvents(): { events: FieldStreamEvent[]; unsubscribe: () => void } {
  const events: FieldStreamEvent[] = [];
  const unsubscribe = streamHub.subscribe((event) => {
    events.push(event);
  });
  return { events, unsubscribe };
}

describe("event responder route", () => {
  let tempDir: string;
  let databasePath: string;

  function setupDatabase(seed?: (repos: ReturnType<typeof createRepositories>) => void): void {
    const client = createDatabaseClient({ path: databasePath });
    try {
      const repos = createRepositories(client.db);
      repos.settings.upsert(DEFAULT_SETTINGS);
      repos.nodes.upsert(node);
      repos.responders.upsert(responder);
      repos.signals.insert({ ...leadSignal, eventId: null });
      repos.events.insert(event);
      repos.signals.attachToEvent(leadSignal.id, event.id);
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date(plusSeconds(T0, 37)));
    tempDir = mkdtempSync(path.join(tmpdir(), "coexist-response-"));
    databasePath = path.join(tempDir, "test.sqlite");
    process.env.COEXIST_DB_PATH = databasePath;
    resetRuntimeDatabase();
    resetStreamHub();
    resetEscalationRuntime();
  });

  afterEach(() => {
    resetRuntimeDatabase();
    resetStreamHub();
    resetEscalationRuntime();
    delete process.env.COEXIST_DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it("records acknowledgement, moves the event to responding, emits SSE drafts and cancels escalation", async () => {
    setupDatabase((repos) => {
      repos.alerts.insert({
        id: "alt-tier-1",
        eventId: event.id,
        outageId: null,
        tier: 1,
        channel: "guard_webex",
        targetRef: responder.id,
        status: "delivered",
        queuedAt: T0,
        sentAt: plusSeconds(T0, 1),
        deliveredAt: plusSeconds(T0, 2),
        failedReason: null,
        isLive: false,
      });
      scheduleEscalationForEvent(repos, event.id, T0);
    });
    expect(scheduledEscalationDueAt(event.id)).toBe(plusSeconds(T0, 90));
    const collected = collectStreamEvents();

    const response = await postEventResponse(
      jsonRequest({ responderId: responder.id, action: "acknowledged" }),
      params(event.id),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      response: {
        eventId: event.id,
        responderId: responder.id,
        action: "acknowledged",
        at: plusSeconds(T0, 37),
      },
      event: {
        id: event.id,
        state: "responding",
        resolvedAt: null,
      },
    });
    expect(scheduledEscalationDueAt(event.id)).toBeNull();
    expect(collected.events.map((event) => event.type)).toEqual(["response", "event"]);
    expect(
      inspectDatabase((repos, db) => ({
        event: repos.events.findById("evt-1"),
        responses: db.select({ value: count() }).from(responses).get()?.value,
      })),
    ).toMatchObject({
      event: { state: "responding", resolvedAt: null },
      responses: 1,
    });
    collected.unsubscribe();
  });

  it("records en route and on site actions while keeping the event responding", async () => {
    setupDatabase((repos) => {
      repos.events.update({ ...event, state: "responding" });
    });

    const enRoute = await postEventResponse(
      jsonRequest({ responderId: responder.id, action: "en_route" }),
      params(event.id),
    );
    vi.setSystemTime(new Date(plusSeconds(T0, 120)));
    const onSite = await postEventResponse(
      jsonRequest({ responderId: responder.id, action: "on_site" }),
      params(event.id),
    );

    expect(enRoute.status).toBe(200);
    expect(onSite.status).toBe(200);
    expect(
      inspectDatabase((repos) => ({
        event: repos.events.findById("evt-1"),
        actions: repos.responses.listForEvent("evt-1").map((response) => response.action),
      })),
    ).toEqual({
      event: { ...event, state: "responding" },
      actions: ["en_route", "on_site"],
    });
  });

  it("records resolved, stamps resolvedAt and leaves the event terminal", async () => {
    setupDatabase((repos) => {
      repos.events.update({ ...event, state: "responding" });
    });

    const response = await postEventResponse(
      jsonRequest({ responderId: responder.id, action: "resolved" }),
      params(event.id),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      event: {
        id: event.id,
        state: "resolved",
        resolvedAt: plusSeconds(T0, 37),
      },
      response: { action: "resolved" },
    });
    expect(inspectDatabase((repos) => repos.events.findById("evt-1"))).toMatchObject({
      state: "resolved",
      resolvedAt: plusSeconds(T0, 37),
    });
  });

  it("locks progression to the acknowledging owner and lets a senior take over by acknowledging", async () => {
    const range: Responder = {
      id: "range-alpha",
      name: "Range RRT Alpha",
      role: "district_officer",
      tier: 2,
      webexEmail: null,
      phoneLabel: "Range radio",
      nodeIds: ["n2"],
    };
    setupDatabase((repos) => {
      repos.responders.upsert(range);
    });

    // Beat officer acknowledges -> owns the incident (event -> responding).
    await postEventResponse(
      jsonRequest({ responderId: responder.id, action: "acknowledged" }),
      params(event.id),
    );

    // A different responder cannot progress it.
    const blocked = await postEventResponse(
      jsonRequest({ responderId: range.id, action: "resolved" }),
      params(event.id),
    );
    expect(blocked.status).toBe(409);
    expect(await readJson(blocked)).toMatchObject({ error: { code: "not_incident_owner" } });
    expect(inspectDatabase((repos) => repos.events.findById("evt-1")?.state)).toBe("responding");

    // Later, the senior takes over by acknowledging, then may resolve.
    vi.setSystemTime(new Date(plusSeconds(T0, 90)));
    await postEventResponse(
      jsonRequest({ responderId: range.id, action: "acknowledged" }),
      params(event.id),
    );
    const resolved = await postEventResponse(
      jsonRequest({ responderId: range.id, action: "resolved" }),
      params(event.id),
    );
    expect(resolved.status).toBe(200);
    expect(inspectDatabase((repos) => repos.events.findById("evt-1")?.state)).toBe("resolved");
  });

  it("rejects malformed actions without writing a response", async () => {
    setupDatabase();

    const response = await postEventResponse(
      jsonRequest({ responderId: responder.id, action: "heading_there" }),
      params(event.id),
    );

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({
      error: { code: "invalid_request" },
    });
    expect(inspectDatabase((_, db) => db.select({ value: count() }).from(responses).get()?.value)).toBe(0);
  });

  it("returns 404 for unknown events and responders", async () => {
    setupDatabase();

    const missingEvent = await postEventResponse(
      jsonRequest({ responderId: responder.id, action: "acknowledged" }),
      params("missing"),
    );
    const missingResponder = await postEventResponse(
      jsonRequest({ responderId: "missing", action: "acknowledged" }),
      params(event.id),
    );

    expect(missingEvent.status).toBe(404);
    expect(await readJson(missingEvent)).toMatchObject({
      error: { code: "event_not_found" },
    });
    expect(missingResponder.status).toBe(404);
    expect(await readJson(missingResponder)).toMatchObject({
      error: { code: "responder_not_found" },
    });
  });
});

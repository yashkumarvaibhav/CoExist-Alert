import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as webhookPost } from "@/app/api/webex/webhook/route";
import { createDatabaseClient } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { resetRuntimeDatabase } from "@/db/runtime";
import { resetEscalationRuntime } from "@/escalation/runtime";
import type { IncursionEvent, Responder, SensorNode, Signal } from "@/domain/types";

const SECRET = "webhook-secret";
const EVENT_ID = "evt-1";
const RESPONDER_ID = "guard-1";

function node(): SensorNode {
  return {
    id: "n2",
    name: "Rail Crossing KM-47",
    kind: "rail_crossing",
    lat: 26.87,
    lng: 88.85,
    geofenceRadiusM: 1_800,
    status: "healthy",
    batteryPct: 80,
    linkQualityPct: 90,
    lastHeartbeatAt: "2026-07-01T12:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
  };
}

function leadSignal(): Signal {
  return {
    id: "sig-1",
    nodeId: "n2",
    at: "2026-07-01T12:00:00.000Z",
    source: "camera",
    classification: "elephant_class",
    confidence: 0.9,
    snapshotPath: null,
    // Inserted before the event (event.leadSignalId references it); the
    // signal→event backlink is irrelevant to the ack flow, so leave it null to
    // avoid the circular FK.
    eventId: null,
  };
}

function confirmedEvent(overrides: Partial<IncursionEvent> = {}): IncursionEvent {
  return {
    id: EVENT_ID,
    nodeId: "n2",
    openedAt: "2026-07-01T12:00:00.000Z",
    state: "confirmed",
    confirmedAt: "2026-07-01T12:00:31.000Z",
    resolvedAt: null,
    speciesLabel: "elephant_class",
    leadSignalId: "sig-1",
    confirmSignalId: null,
    firstDeliveryAt: null,
    ...overrides,
  };
}

function responder(): Responder {
  return {
    id: RESPONDER_ID,
    name: "Beat Officer R. Sharma",
    role: "guard",
    tier: 1,
    webexEmail: null,
    phoneLabel: "Guard mobile",
    nodeIds: ["n2"],
  };
}

function actionInputsResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ inputs: { coexistAction: "acknowledge", eventId: EVENT_ID, responderId: RESPONDER_ID } }),
  } as unknown as Response;
}

function webhookRequest(body: unknown, secret: string | null): Request {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) {
    headers["x-spark-signature"] = createHmac("sha1", secret).update(raw, "utf8").digest("hex");
  }
  return new Request("http://localhost/api/webex/webhook", { method: "POST", headers, body: raw });
}

const attachmentActionEnvelope = {
  resource: "attachmentActions",
  event: "created",
  data: { id: "act-1", personId: "p1", roomId: "r1" },
};

describe("POST /api/webex/webhook", () => {
  let tempDir: string;
  let databasePath: string;

  function seed(eventOverrides: Partial<IncursionEvent> = {}): void {
    const client = createDatabaseClient({ path: databasePath });
    try {
      const repos = createRepositories(client.db);
      repos.nodes.upsert(node());
      repos.signals.insert(leadSignal());
      repos.events.insert(confirmedEvent(eventOverrides));
      repos.responders.upsert(responder());
    } finally {
      client.close();
    }
  }

  function readEvent(): IncursionEvent | null {
    const client = createDatabaseClient({ path: databasePath });
    try {
      return createRepositories(client.db).events.findById(EVENT_ID);
    } finally {
      client.close();
    }
  }

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "coexist-webhook-"));
    databasePath = path.join(tempDir, "test.sqlite");
    process.env.COEXIST_DB_PATH = databasePath;
    process.env.WEBEX_BOT_TOKEN = "tok";
    process.env.WEBEX_WEBHOOK_SECRET = SECRET;
    delete process.env.WEBEX_ROOM_ID; // keep the status post a no-op (no extra fetch)
    resetRuntimeDatabase();
    resetEscalationRuntime();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRuntimeDatabase();
    resetEscalationRuntime();
    delete process.env.COEXIST_DB_PATH;
    delete process.env.WEBEX_BOT_TOKEN;
    delete process.env.WEBEX_WEBHOOK_SECRET;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("acknowledges the event from a validly-signed attachment action", async () => {
    seed();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(actionInputsResponse());

    const response = await webhookPost(webhookRequest(attachmentActionEnvelope, SECRET));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, acknowledged: EVENT_ID });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // fetched the action inputs
    expect(readEvent()?.state).toBe("responding"); // confirmed -> responding on ack
  });

  it("rejects a bad signature and does not touch state", async () => {
    seed();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const request = webhookRequest(attachmentActionEnvelope, "wrong-secret");
    const response = await webhookPost(request);

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readEvent()?.state).toBe("confirmed");
  });

  it("is an inert no-op when the webhook secret is not configured", async () => {
    seed();
    delete process.env.WEBEX_WEBHOOK_SECRET;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await webhookPost(webhookRequest(attachmentActionEnvelope, SECRET));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, skipped: "unconfigured" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readEvent()?.state).toBe("confirmed");
  });

  it("benignly ignores a tap on an already-resolved event", async () => {
    seed({ state: "resolved", resolvedAt: "2026-07-01T12:20:00.000Z" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(actionInputsResponse());

    const response = await webhookPost(webhookRequest(attachmentActionEnvelope, SECRET));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ignored).toBe("event_not_open");
    expect(readEvent()?.state).toBe("resolved");
  });

  it("ignores a non-attachment-action webhook without fetching inputs", async () => {
    seed();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await webhookPost(
      webhookRequest({ resource: "messages", event: "created", data: { id: "m1" } }, SECRET),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(body.ignored).toBe("not_an_attachment_action");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readEvent()?.state).toBe("confirmed");
  });
});

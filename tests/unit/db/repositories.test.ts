import { describe, expect, it } from "vitest";

import { createInMemoryDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type {
  Alert,
  EventResponse,
  Heartbeat,
  IncursionEvent,
  Outage,
  Responder,
  SensorNode,
  Signal,
  VillagerZone,
} from "@/domain/types";

describe("database repositories", () => {
  it("round-trips the alert pipeline records on in-memory SQLite", () => {
    const database = createInMemoryDatabase();

    try {
      const repos = createRepositories(database.db);
      const createdAt = "2026-07-02T00:00:00.000Z";
      const heartbeatAt = "2026-07-02T00:00:10.000Z";
      const confirmedAt = "2026-07-02T00:00:32.000Z";

      const node: SensorNode = {
        id: "n2",
        name: "Rail Crossing KM-47",
        kind: "rail_crossing",
        lat: 26.89,
        lng: 88.89,
        geofenceRadiusM: 1_500,
        status: "healthy",
        batteryPct: 86,
        linkQualityPct: 93,
        lastHeartbeatAt: heartbeatAt,
        createdAt,
      };
      expect(repos.nodes.upsert(node)).toEqual(node);
      expect(repos.nodes.findById("n2")).toEqual(node);

      const heartbeat: Heartbeat = {
        id: "hb-1",
        nodeId: "n2",
        at: heartbeatAt,
        batteryPct: 86,
        linkQualityPct: 93,
      };
      repos.heartbeats.insert(heartbeat);
      expect(repos.heartbeats.listForNode("n2")).toEqual([heartbeat]);

      const leadSignal: Signal = {
        id: "sig-1",
        nodeId: "n2",
        at: "2026-07-02T00:00:01.000Z",
        source: "camera",
        classification: "large_animal",
        confidence: 0.62,
        snapshotPath: "/demo-snapshots/n2-camera.svg",
        eventId: null,
      };
      repos.signals.insert(leadSignal);

      const event: IncursionEvent = {
        id: "evt-1",
        nodeId: "n2",
        openedAt: leadSignal.at,
        state: "unconfirmed",
        confirmedAt: null,
        resolvedAt: null,
        speciesLabel: null,
        leadSignalId: "sig-1",
        confirmSignalId: null,
        firstDeliveryAt: null,
      };
      repos.events.insert(event);
      repos.signals.attachToEvent("sig-1", "evt-1");

      const confirmSignal: Signal = {
        id: "sig-2",
        nodeId: "n2",
        at: confirmedAt,
        source: "thermal",
        classification: "elephant_class",
        confidence: 0.91,
        snapshotPath: "/demo-snapshots/n2-thermal.svg",
        eventId: "evt-1",
      };
      repos.signals.insert(confirmSignal);

      const confirmedEvent: IncursionEvent = {
        ...event,
        state: "confirmed",
        confirmedAt,
        speciesLabel: "elephant_class",
        confirmSignalId: "sig-2",
      };
      repos.events.update(confirmedEvent);

      expect(repos.events.findById("evt-1")).toEqual(confirmedEvent);
      expect(repos.events.findOpenByNode("n2")).toEqual(confirmedEvent);
      expect(repos.signals.listForEvent("evt-1").map((signal) => signal.id)).toEqual([
        "sig-1",
        "sig-2",
      ]);

      const responder: Responder = {
        id: "guard-1",
        name: "Beat Officer R. Sharma",
        role: "guard",
        tier: 1,
        webexEmail: "sharma@example.test",
        phoneLabel: "Guard phone",
        nodeIds: ["n1", "n2"],
      };
      repos.responders.upsert(responder);
      expect(repos.responders.listForNode("n2")).toEqual([responder]);

      const nearbyZone: VillagerZone = {
        id: "zone-chalsa-basti",
        label: "Chalsa Basti",
        lat: 26.891,
        lng: 88.887,
      };
      repos.villagerZones.upsert(nearbyZone);
      expect(repos.villagerZones.list()).toEqual([nearbyZone]);

      const alert: Alert = {
        id: "alert-1",
        eventId: "evt-1",
        outageId: null,
        tier: 1,
        channel: "guard_webex",
        targetRef: "guard-1",
        status: "queued",
        queuedAt: confirmedAt,
        sentAt: null,
        deliveredAt: null,
        failedReason: null,
        isLive: false,
      };
      repos.alerts.insert(alert);
      repos.alerts.updateStatus("alert-1", {
        status: "delivered",
        sentAt: "2026-07-02T00:00:33.000Z",
        deliveredAt: "2026-07-02T00:00:35.000Z",
      });
      expect(repos.alerts.listForEvent("evt-1")).toEqual([
        {
          ...alert,
          status: "delivered",
          sentAt: "2026-07-02T00:00:33.000Z",
          deliveredAt: "2026-07-02T00:00:35.000Z",
        },
      ]);

      const response: EventResponse = {
        id: "resp-1",
        eventId: "evt-1",
        responderId: "guard-1",
        action: "acknowledged",
        at: "2026-07-02T00:00:50.000Z",
      };
      repos.responses.insert(response);
      expect(repos.responses.listForEvent("evt-1")).toEqual([response]);

      const outage: Outage = {
        id: "out-1",
        nodeId: "n2",
        startedAt: "2026-07-02T01:00:00.000Z",
        endedAt: null,
        opsAlerted: true,
      };
      repos.outages.insert(outage);
      expect(repos.outages.findOpenForNode("n2")).toEqual(outage);
      const blindspotAlert: Alert = {
        id: "alert-blindspot",
        eventId: null,
        outageId: "out-1",
        tier: 1,
        channel: "blindspot_ops",
        targetRef: "n2",
        status: "delivered",
        queuedAt: outage.startedAt,
        sentAt: "2026-07-02T01:00:01.000Z",
        deliveredAt: "2026-07-02T01:00:02.000Z",
        failedReason: null,
        isLive: false,
      };
      repos.alerts.insert(blindspotAlert);
      expect(repos.alerts.listForOutage("out-1")).toEqual([blindspotAlert]);
      repos.outages.close("out-1", "2026-07-02T01:05:00.000Z");
      expect(repos.outages.findOpenForNode("n2")).toBeNull();

      const settings = {
        ...DEFAULT_SETTINGS,
        confirmationWindowS: 60,
        escalationTimeoutS: 75,
      };
      repos.settings.upsert(settings);
      expect(repos.settings.get()).toEqual(settings);
    } finally {
      database.close();
    }
  });

  it("enforces foreign keys", () => {
    const database = createInMemoryDatabase();

    try {
      const repos = createRepositories(database.db);
      expect(() =>
        repos.signals.insert({
          id: "sig-orphan",
          nodeId: "missing-node",
          at: "2026-07-02T00:00:00.000Z",
          source: "camera",
          classification: "large_animal",
          confidence: 0.9,
          snapshotPath: null,
          eventId: null,
        }),
      ).toThrow();
    } finally {
      database.close();
    }
  });

  it("lists recent signals, windowed alerts and recent outages for the dashboard", () => {
    const database = createInMemoryDatabase();

    try {
      const repos = createRepositories(database.db);
      const node: SensorNode = {
        id: "n1",
        name: "Village Boundary East",
        kind: "village_boundary",
        lat: 26.87,
        lng: 88.85,
        geofenceRadiusM: 1_200,
        status: "healthy",
        batteryPct: 80,
        linkQualityPct: 90,
        lastHeartbeatAt: null,
        createdAt: "2026-07-01T00:00:00.000Z",
      };
      repos.nodes.upsert(node);

      for (let i = 0; i < 4; i += 1) {
        const signal: Signal = {
          id: `sig-${i}`,
          nodeId: "n1",
          at: `2026-07-02T00:0${i}:00.000Z`,
          source: "camera",
          classification: "large_animal",
          confidence: 0.5,
          snapshotPath: null,
          eventId: null,
        };
        repos.signals.insert(signal);
      }
      expect(repos.signals.listRecent(2).map((s) => s.id)).toEqual([
        "sig-3",
        "sig-2",
      ]);

      const event: IncursionEvent = {
        id: "ev-1",
        nodeId: "n1",
        openedAt: "2026-07-02T00:00:00.000Z",
        state: "confirmed",
        confirmedAt: "2026-07-02T00:00:30.000Z",
        resolvedAt: null,
        speciesLabel: "elephant_class",
        leadSignalId: "sig-0",
        confirmSignalId: "sig-1",
        firstDeliveryAt: null,
      };
      repos.events.insert(event);

      const makeAlert = (id: string, queuedAt: string): Alert => ({
        id,
        eventId: "ev-1",
        outageId: null,
        tier: 1,
        channel: "siren",
        targetRef: "n1",
        status: "delivered",
        queuedAt,
        sentAt: null,
        deliveredAt: queuedAt,
        failedReason: null,
        isLive: false,
      });
      repos.alerts.insert(makeAlert("al-old", "2026-06-01T00:00:00.000Z"));
      repos.alerts.insert(makeAlert("al-new", "2026-07-02T01:00:00.000Z"));
      expect(
        repos.alerts.listSince("2026-07-01T00:00:00.000Z").map((a) => a.id),
      ).toEqual(["al-new"]);

      const makeOutage = (id: string, startedAt: string): Outage => ({
        id,
        nodeId: "n1",
        startedAt,
        endedAt: null,
        opsAlerted: false,
      });
      repos.outages.insert(makeOutage("out-1", "2026-07-01T00:00:00.000Z"));
      repos.outages.insert(makeOutage("out-2", "2026-07-02T00:00:00.000Z"));
      expect(repos.outages.listRecent(1).map((o) => o.id)).toEqual(["out-2"]);
    } finally {
      database.close();
    }
  });
});

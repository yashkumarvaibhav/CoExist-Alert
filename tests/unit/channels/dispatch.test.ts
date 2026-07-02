import { describe, expect, it } from "vitest";

import { dispatchBlindspotAlert, dispatchCascadeForEvent } from "@/channels/dispatch";
import { createInMemoryDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type {
  IncursionEvent,
  Outage,
  Responder,
  SensorNode,
  Signal,
  VillagerZone,
} from "@/domain/types";

const T0 = "2026-07-02T04:58:02.000Z";
const CONFIRMED_AT = "2026-07-02T04:58:31.000Z";

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

const nearbyZone: VillagerZone = {
  id: "zone-chalsa-basti",
  label: "Chalsa Basti",
  lat: 26.889,
  lng: 88.878,
};

const farZone: VillagerZone = {
  id: "zone-distant-market",
  label: "Distant Market",
  lat: 26.934,
  lng: 88.964,
};

const responders: Responder[] = [
  {
    id: "guard-sharma",
    name: "Beat Officer R. Sharma",
    role: "guard",
    tier: 1,
    webexEmail: "r.sharma@example.test",
    phoneLabel: "Guard mobile",
    nodeIds: ["n2"],
  },
  {
    id: "guard-rrt-alpha",
    name: "Range RRT Alpha",
    role: "guard",
    tier: 2,
    webexEmail: "rrt.alpha@example.test",
    phoneLabel: "Rapid response phone",
    nodeIds: ["n2"],
  },
  {
    id: "nfr-chalsa-control",
    name: "NFR Section Control - Chalsa",
    role: "control_room",
    tier: 1,
    webexEmail: null,
    phoneLabel: "Rail control desk",
    nodeIds: ["n2"],
  },
];

const leadSignal: Signal = {
  id: "sig-lead",
  nodeId: "n2",
  at: T0,
  source: "camera",
  classification: "large_animal",
  confidence: 0.62,
  snapshotPath: "/demo-snapshots/n2-camera.svg",
  eventId: "evt-1",
};

const event: IncursionEvent = {
  id: "evt-1",
  nodeId: "n2",
  openedAt: T0,
  state: "confirmed",
  confirmedAt: CONFIRMED_AT,
  resolvedAt: null,
  speciesLabel: "elephant_class",
  leadSignalId: "sig-lead",
  confirmSignalId: null,
  firstDeliveryAt: null,
};

function setup() {
  const database = createInMemoryDatabase();
  const repos = createRepositories(database.db);
  repos.settings.upsert(DEFAULT_SETTINGS);
  repos.nodes.upsert(node);
  repos.villagerZones.upsert(nearbyZone);
  repos.villagerZones.upsert(farZone);
  for (const responder of responders) repos.responders.upsert(responder);
  repos.signals.insert({ ...leadSignal, eventId: null });
  repos.events.insert(event);
  repos.signals.attachToEvent(leadSignal.id, event.id);
  return { database, repos };
}

describe("channel dispatch service", () => {
  it("dispatches tier-one cascade alerts with terminal simulated delivery rows", () => {
    const { database, repos } = setup();
    try {
      const outcome = dispatchCascadeForEvent(repos, event.id, CONFIRMED_AT);

      expect(outcome.alerts.map((alert) => `${alert.channel}:${alert.targetRef}`)).toEqual([
        "siren:n2",
        "villager_phone:zone-chalsa-basti",
        "guard_webex:guard-sharma",
        "control_room:nfr-chalsa-control",
      ]);
      expect(outcome.alerts.every((alert) => alert.status === "delivered")).toBe(true);
      expect(outcome.alerts.every((alert) => alert.sentAt !== null)).toBe(true);
      expect(outcome.alerts.every((alert) => alert.deliveredAt !== null)).toBe(true);
      expect(outcome.alerts.every((alert) => alert.failedReason === null)).toBe(true);
      expect(outcome.alerts.every((alert) => alert.isLive === false)).toBe(true);
      expect(outcome.streamEvents.map((entry) => entry.type)).toEqual([
        "alert",
        "delivery",
        "alert",
        "delivery",
        "alert",
        "delivery",
        "alert",
        "delivery",
      ]);
      expect(repos.events.findById(event.id)).toMatchObject({
        firstDeliveryAt: "2026-07-02T04:58:32.500Z",
      });

      const again = dispatchCascadeForEvent(repos, event.id, CONFIRMED_AT);
      expect(again.alerts).toEqual([]);
      expect(again.streamEvents).toEqual([]);
      expect(repos.alerts.listForEvent(event.id)).toHaveLength(4);
    } finally {
      database.close();
    }
  });

  it("dispatches one terminal blindspot ops alert per outage", () => {
    const { database, repos } = setup();
    try {
      const outage: Outage = {
        id: "out-1",
        nodeId: "n2",
        startedAt: "2026-07-02T05:10:00.000Z",
        endedAt: null,
        opsAlerted: true,
      };
      repos.outages.insert(outage);

      const outcome = dispatchBlindspotAlert(repos, outage, outage.startedAt);

      expect(outcome.alerts).toHaveLength(1);
      expect(outcome.alerts[0]).toMatchObject({
        eventId: null,
        outageId: "out-1",
        channel: "blindspot_ops",
        targetRef: "n2",
        status: "delivered",
        sentAt: "2026-07-02T05:10:00.200Z",
        deliveredAt: "2026-07-02T05:10:01.200Z",
        failedReason: null,
        isLive: false,
      });
      expect(outcome.streamEvents.map((entry) => entry.type)).toEqual([
        "alert",
        "delivery",
      ]);

      const again = dispatchBlindspotAlert(repos, outage, outage.startedAt);
      expect(again.alerts).toEqual([]);
      expect(again.streamEvents).toEqual([]);
      expect(repos.alerts.listForOutage(outage.id)).toHaveLength(1);
    } finally {
      database.close();
    }
  });
});

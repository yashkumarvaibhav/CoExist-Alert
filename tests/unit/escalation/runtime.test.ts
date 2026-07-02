import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dispatchCascadeForEvent } from "@/channels/dispatch";
import { createInMemoryDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { DEFAULT_SETTINGS } from "@/domain/types";
import type {
  IncursionEvent,
  Responder,
  SensorNode,
  Signal,
  VillagerZone,
} from "@/domain/types";
import {
  rebuildEscalationTimers,
  resetEscalationRuntime,
  scheduleEscalationForEvent,
  scheduledEscalationDueAt,
} from "@/escalation/runtime";
import { recordEventResponse } from "@/responses/service";
import { resetStreamHub, streamHub } from "@/stream/hub";

const T0 = "2026-07-02T04:58:31.000Z";

function plusSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

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
    id: "district-duty-officer",
    name: "District Duty Officer",
    role: "district_officer",
    tier: 3,
    webexEmail: "district.officer@example.test",
    phoneLabel: "District duty line",
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

function setup() {
  const database = createInMemoryDatabase();
  const repos = createRepositories(database.db);
  repos.settings.upsert({ ...DEFAULT_SETTINGS, escalationTimeoutS: 90 });
  repos.nodes.upsert(node);
  repos.villagerZones.upsert(nearbyZone);
  for (const responder of responders) repos.responders.upsert(responder);
  repos.signals.insert({ ...leadSignal, eventId: null });
  repos.events.insert(event);
  repos.signals.attachToEvent(leadSignal.id, event.id);
  return { database, repos };
}

describe("escalation runtime", () => {
  const originalToken = process.env.WEBEX_BOT_TOKEN;
  const originalRoom = process.env.WEBEX_ROOM_ID;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T0));
    delete process.env.WEBEX_BOT_TOKEN;
    delete process.env.WEBEX_ROOM_ID;
    resetEscalationRuntime();
    resetStreamHub();
  });

  afterEach(() => {
    resetEscalationRuntime();
    resetStreamHub();
    vi.useRealTimers();
    if (originalToken === undefined) {
      delete process.env.WEBEX_BOT_TOKEN;
    } else {
      process.env.WEBEX_BOT_TOKEN = originalToken;
    }
    if (originalRoom === undefined) {
      delete process.env.WEBEX_ROOM_ID;
    } else {
      process.env.WEBEX_ROOM_ID = originalRoom;
    }
  });

  it("dispatches tier two exactly once when no one acknowledges before timeout", async () => {
    const { database, repos } = setup();
    const streamed: string[] = [];
    const unsubscribe = streamHub.subscribe((entry) => {
      streamed.push(`${entry.type}:${"tier" in entry.payload ? entry.payload.tier : ""}`);
    });
    try {
      await dispatchCascadeForEvent(repos, event.id, T0);

      scheduleEscalationForEvent(repos, event.id, T0);
      expect(scheduledEscalationDueAt(event.id)).toBe(plusSeconds(T0, 90));

      await vi.advanceTimersByTimeAsync(89_000);
      expect(repos.alerts.listForEvent(event.id).filter((alert) => alert.tier === 2)).toEqual([]);

      await vi.advanceTimersByTimeAsync(1_000);
      const tierTwo = repos.alerts.listForEvent(event.id).filter((alert) => alert.tier === 2);
      expect(tierTwo).toHaveLength(1);
      expect(tierTwo[0]).toMatchObject({
        channel: "guard_webex",
        targetRef: "guard-rrt-alpha",
        status: "delivered",
        isLive: false,
      });
      expect(scheduledEscalationDueAt(event.id)).toBe(plusSeconds(T0, 180));

      await vi.advanceTimersByTimeAsync(1_000);
      expect(repos.alerts.listForEvent(event.id).filter((alert) => alert.tier === 2)).toHaveLength(1);
      expect(streamed).toContain("alert:2");
      expect(streamed).toContain("delivery:2");
    } finally {
      unsubscribe();
      database.close();
    }
  });

  it("cancels the pending escalation when acknowledged one second before timeout", async () => {
    const { database, repos } = setup();
    try {
      await dispatchCascadeForEvent(repos, event.id, T0);
      scheduleEscalationForEvent(repos, event.id, T0);

      await vi.advanceTimersByTimeAsync(89_000);
      const outcome = recordEventResponse(
        repos,
        event.id,
        { responderId: "guard-sharma", action: "acknowledged" },
        plusSeconds(T0, 89),
      );

      expect(outcome.event.state).toBe("responding");
      expect(outcome.response).toMatchObject({
        eventId: event.id,
        responderId: "guard-sharma",
        action: "acknowledged",
        at: plusSeconds(T0, 89),
      });
      expect(outcome.streamEvents.map((entry) => entry.type)).toEqual(["response", "event"]);
      expect(scheduledEscalationDueAt(event.id)).toBeNull();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(repos.alerts.listForEvent(event.id).filter((alert) => alert.tier === 2)).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("rebuilds boot timers with remaining timeout instead of a fresh timeout", async () => {
    const { database, repos } = setup();
    try {
      await dispatchCascadeForEvent(repos, event.id, T0);

      vi.setSystemTime(new Date(plusSeconds(T0, 40)));
      rebuildEscalationTimers(repos, plusSeconds(T0, 40));
      expect(scheduledEscalationDueAt(event.id)).toBe(plusSeconds(T0, 90));

      await vi.advanceTimersByTimeAsync(49_000);
      expect(repos.alerts.listForEvent(event.id).filter((alert) => alert.tier === 2)).toEqual([]);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(repos.alerts.listForEvent(event.id).filter((alert) => alert.tier === 2)).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("dispatches tier three once and never schedules beyond the max tier", async () => {
    const { database, repos } = setup();
    try {
      await dispatchCascadeForEvent(repos, event.id, T0);
      scheduleEscalationForEvent(repos, event.id, T0);

      await vi.advanceTimersByTimeAsync(90_000);
      await vi.advanceTimersByTimeAsync(90_000);
      const tierThree = repos.alerts.listForEvent(event.id).filter((alert) => alert.tier === 3);
      expect(tierThree).toHaveLength(1);
      expect(tierThree[0]).toMatchObject({
        channel: "guard_webex",
        targetRef: "district-duty-officer",
        status: "delivered",
      });
      expect(scheduledEscalationDueAt(event.id)).toBeNull();

      await vi.advanceTimersByTimeAsync(180_000);
      expect(repos.alerts.listForEvent(event.id).filter((alert) => alert.tier === 3)).toHaveLength(1);
      expect(Math.max(...repos.alerts.listForEvent(event.id).map((alert) => alert.tier))).toBe(3);
    } finally {
      database.close();
    }
  });
});

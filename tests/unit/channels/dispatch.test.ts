import { afterEach, describe, expect, it, vi } from "vitest";

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
  const originalToken = process.env.WEBEX_BOT_TOKEN;
  const originalRoom = process.env.WEBEX_ROOM_ID;

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("dispatches tier-one cascade alerts with terminal simulated delivery rows", async () => {
    delete process.env.WEBEX_BOT_TOKEN;
    delete process.env.WEBEX_ROOM_ID;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("unexpected Webex call"));
    const { database, repos } = setup();
    try {
      const outcome = await dispatchCascadeForEvent(repos, event.id, CONFIRMED_AT);

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
      expect(fetchMock).not.toHaveBeenCalled();
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

      const again = await dispatchCascadeForEvent(repos, event.id, CONFIRMED_AT);
      expect(again.alerts).toEqual([]);
      expect(again.streamEvents).toEqual([]);
      expect(repos.alerts.listForEvent(event.id)).toHaveLength(4);
    } finally {
      database.close();
    }
  });

  it("dispatches one terminal blindspot ops alert per outage", async () => {
    delete process.env.WEBEX_BOT_TOKEN;
    delete process.env.WEBEX_ROOM_ID;
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

      const outcome = await dispatchBlindspotAlert(repos, outage, outage.startedAt);

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

      const again = await dispatchBlindspotAlert(repos, outage, outage.startedAt);
      expect(again.alerts).toEqual([]);
      expect(again.streamEvents).toEqual([]);
      expect(repos.alerts.listForOutage(outage.id)).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("sends blindspot ops alerts to Webex live when credentials are present", async () => {
    vi.setSystemTime(new Date("2026-07-02T05:10:02.500Z"));
    process.env.WEBEX_BOT_TOKEN = "test-webex-token";
    process.env.WEBEX_ROOM_ID = "room-123";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "msg-blindspot" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
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

      const outcome = await dispatchBlindspotAlert(repos, outage, outage.startedAt);

      expect(outcome.alerts[0]).toMatchObject({
        eventId: null,
        outageId: "out-1",
        channel: "blindspot_ops",
        targetRef: "n2",
        status: "delivered",
        sentAt: "2026-07-02T05:10:02.500Z",
        deliveredAt: "2026-07-02T05:10:02.500Z",
        failedReason: null,
        isLive: true,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://webexapis.com/v1/messages");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer test-webex-token",
        "content-type": "application/json",
      });
      const body = JSON.parse(init?.body as string) as {
        roomId: string;
        markdown: string;
        attachments: Array<{ contentType: string; content: unknown }>;
      };
      expect(body.roomId).toBe("room-123");
      expect(body.markdown).toContain("SIMULATED field outage");
      expect(body.markdown).toContain("Rail Crossing KM-47");
      expect(body.markdown).toContain("Dispatch patrol");
      expect(JSON.stringify(body.attachments[0].content)).toContain("Blind-spot ops alert");
      expect(JSON.stringify(body)).not.toContain("test-webex-token");
    } finally {
      database.close();
      vi.useRealTimers();
    }
  });

  it("sends guard Webex alerts live when credentials are present", async () => {
    vi.setSystemTime(new Date("2026-07-02T04:58:34.250Z"));
    process.env.WEBEX_BOT_TOKEN = "test-webex-token";
    process.env.WEBEX_ROOM_ID = "room-123";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "msg-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { database, repos } = setup();
    try {
      const outcome = await dispatchCascadeForEvent(repos, event.id, CONFIRMED_AT);
      const guard = outcome.alerts.find((alert) => alert.channel === "guard_webex");

      expect(guard).toMatchObject({
        status: "delivered",
        isLive: true,
        sentAt: "2026-07-02T04:58:34.250Z",
        deliveredAt: "2026-07-02T04:58:34.250Z",
        failedReason: null,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://webexapis.com/v1/messages");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer test-webex-token",
        "content-type": "application/json",
      });
      const body = JSON.parse(init?.body as string) as {
        roomId: string;
        markdown: string;
        attachments: Array<{ contentType: string; content: { body: unknown[] } }>;
      };
      expect(body.roomId).toBe("room-123");
      expect(body.markdown).toContain("CoExist Alert");
      expect(body.markdown).toContain("Rail Crossing KM-47");
      expect(body.attachments[0]).toMatchObject({
        contentType: "application/vnd.microsoft.card.adaptive",
      });
      expect(JSON.stringify(body.attachments[0].content)).toContain("elephant_class");
      expect(JSON.stringify(body.attachments[0].content)).toContain("https://www.google.com/maps/search/?api=1&query=26.89,88.89");
      expect(JSON.stringify(body)).not.toContain("test-webex-token");
    } finally {
      database.close();
      vi.useRealTimers();
    }
  });

  it("records a failed terminal Webex delivery when the API rejects the message", async () => {
    vi.setSystemTime(new Date("2026-07-02T04:58:34.250Z"));
    process.env.WEBEX_BOT_TOKEN = "test-webex-token";
    process.env.WEBEX_ROOM_ID = "room-123";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const { database, repos } = setup();
    try {
      const outcome = await dispatchCascadeForEvent(repos, event.id, CONFIRMED_AT);
      const guard = outcome.alerts.find((alert) => alert.channel === "guard_webex");

      expect(guard).toMatchObject({
        status: "failed",
        isLive: true,
        sentAt: "2026-07-02T04:58:34.250Z",
        deliveredAt: null,
        failedReason: "Webex API 401: Bad credentials",
      });
      expect(guard?.failedReason).not.toContain("test-webex-token");
      expect(repos.alerts.listForEvent(event.id).find((alert) => alert.channel === "guard_webex")).toMatchObject({
        status: "failed",
        failedReason: "Webex API 401: Bad credentials",
        isLive: true,
      });
    } finally {
      database.close();
      vi.useRealTimers();
    }
  });
});

import { count, eq } from "drizzle-orm";
import { pathToFileURL } from "node:url";

import { DEFAULT_SETTINGS } from "@/domain/types";
import type {
  Alert,
  AlertChannel,
  AlertTier,
  EventResponse,
  Heartbeat,
  IncursionEvent,
  Outage,
  Responder,
  SensorNode,
  Signal,
  SignalSource,
  VillagerZone,
} from "@/domain/types";

import { createDatabaseClient } from "./client";
import type { AppDatabase } from "./client";
import { createRepositories } from "./repositories";
import {
  alerts,
  events,
  heartbeats,
  nodes,
  outages,
  responders,
  responses,
  signals,
  villagerZones,
} from "./schema";

const IST_OFFSET_MS = 330 * 60 * 1000;
const ANCHOR_YEAR = 2026;
const ANCHOR_MONTH_INDEX = 6;
const ANCHOR_DAY = 2;

export interface SeedSummary {
  nodes: number;
  villagerZones: number;
  responders: number;
  heartbeats: number;
  signals: number;
  events: number;
  alerts: number;
  responses: number;
  outages: number;
}

const seedNodes: SensorNode[] = [
  {
    id: "n1",
    name: "Village Boundary East",
    kind: "village_boundary",
    lat: 26.87,
    lng: 88.85,
    geofenceRadiusM: 1_800,
    status: "healthy",
    batteryPct: 82,
    linkQualityPct: 91,
    lastHeartbeatAt: "2026-07-02T09:29:42.000Z",
    createdAt: "2026-06-02T00:00:00.000Z",
  },
  {
    id: "n2",
    name: "Rail Crossing KM-47",
    kind: "rail_crossing",
    lat: 26.89,
    lng: 88.89,
    geofenceRadiusM: 2_200,
    status: "healthy",
    batteryPct: 86,
    linkQualityPct: 94,
    lastHeartbeatAt: "2026-07-02T09:29:44.000Z",
    createdAt: "2026-06-02T00:00:00.000Z",
  },
  {
    id: "n3",
    name: "Waterhole 7",
    kind: "waterhole",
    lat: 26.85,
    lng: 88.91,
    geofenceRadiusM: 1_500,
    status: "healthy",
    batteryPct: 78,
    linkQualityPct: 88,
    lastHeartbeatAt: "2026-07-02T09:29:41.000Z",
    createdAt: "2026-06-02T00:00:00.000Z",
  },
];

const seedZones: VillagerZone[] = [
  { id: "zone-uttar-madhupur-east", label: "Uttar Madhupur East", lat: 26.872, lng: 88.858 },
  { id: "zone-uttar-madhupur-school", label: "Uttar Madhupur School", lat: 26.866, lng: 88.842 },
  { id: "zone-chalsa-basti", label: "Chalsa Basti", lat: 26.889, lng: 88.878 },
  { id: "zone-km47-line-bazar", label: "KM-47 Line Bazar", lat: 26.896, lng: 88.902 },
  { id: "zone-distant-market", label: "Distant Market", lat: 26.934, lng: 88.964 },
];

const seedResponders: Responder[] = [
  {
    id: "guard-sharma",
    name: "Beat Officer R. Sharma",
    role: "guard",
    tier: 1,
    webexEmail: "r.sharma@example.test",
    phoneLabel: "Guard mobile",
    nodeIds: ["n1", "n2"],
  },
  {
    id: "guard-rrt-alpha",
    name: "Range RRT Alpha",
    role: "guard",
    tier: 2,
    webexEmail: "rrt.alpha@example.test",
    phoneLabel: "Rapid response phone",
    nodeIds: ["n1", "n2", "n3"],
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
  {
    id: "district-duty-officer",
    name: "District Duty Officer",
    role: "district_officer",
    tier: 3,
    webexEmail: "district.officer@example.test",
    phoneLabel: "District duty line",
    nodeIds: ["n1", "n2", "n3"],
  },
];

function isoFromIst(dayOffset: number, hour: number, minute: number, second = 0): string {
  const istMs = Date.UTC(
    ANCHOR_YEAR,
    ANCHOR_MONTH_INDEX,
    ANCHOR_DAY - dayOffset,
    hour,
    minute,
    second,
  );
  return new Date(istMs - IST_OFFSET_MS).toISOString();
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

function nodeForDay(dayOffset: number): SensorNode {
  if (dayOffset % 5 === 0) return seedNodes[2];
  if (dayOffset % 3 === 0) return seedNodes[0];
  return seedNodes[1];
}

function channelTargets(nodeId: string): Array<{
  channel: AlertChannel;
  targetRef: string;
  tier: AlertTier;
}> {
  const guardTarget = nodeId === "n3" ? "guard-rrt-alpha" : "guard-sharma";
  const base: Array<{ channel: AlertChannel; targetRef: string; tier: AlertTier }> = [
    { channel: "siren", targetRef: nodeId, tier: 1 },
    { channel: "guard_webex", targetRef: guardTarget, tier: 1 },
  ];

  if (nodeId === "n1") {
    base.splice(1, 0, {
      channel: "villager_phone",
      targetRef: "zone-uttar-madhupur-east",
      tier: 1,
    });
  }
  if (nodeId === "n2") {
    base.splice(1, 0, { channel: "villager_phone", targetRef: "zone-chalsa-basti", tier: 1 });
    base.push({ channel: "control_room", targetRef: "nfr-chalsa-control", tier: 1 });
  }

  return base;
}

interface EventSeed {
  event: IncursionEvent;
  signals: Signal[];
  alerts: Alert[];
  responses: EventResponse[];
}

function makeConfirmedEvent(dayOffset: number): EventSeed {
  const node = nodeForDay(dayOffset);
  const hour = dayOffset % 2 === 0 ? 5 : 18;
  const openedAt = isoFromIst(dayOffset, hour, (dayOffset * 7) % 50, 2);
  const confirmedAt = addSeconds(openedAt, 31);
  const resolvedAt = addSeconds(confirmedAt, 20 * 60);
  const firstDeliveryAt = addSeconds(confirmedAt, 4);
  const speciesLabel = node.id === "n3" ? "large_animal" : "elephant_class";
  const eventId = `hist-${dayOffset.toString().padStart(2, "0")}-${node.id}`;
  const leadSource: SignalSource = dayOffset % 2 === 0 ? "camera" : "motion";
  const confirmSource: SignalSource = node.id === "n3" ? "acoustic" : "thermal";

  const leadSignal: Signal = {
    id: `${eventId}-lead`,
    nodeId: node.id,
    at: openedAt,
    source: leadSource,
    classification: "large_animal",
    confidence: 0.62,
    snapshotPath:
      node.id === "n1"
        ? "/demo-snapshots/n1-dawn-boundary.svg"
        : "/demo-snapshots/n2-camera.svg",
    eventId,
  };
  const confirmSignal: Signal = {
    id: `${eventId}-confirm`,
    nodeId: node.id,
    at: confirmedAt,
    source: confirmSource,
    classification: speciesLabel,
    confidence: 0.91,
    snapshotPath:
      node.id === "n3"
        ? "/demo-snapshots/n3-waterhole.svg"
        : "/demo-snapshots/n2-thermal.svg",
    eventId,
  };

  const event: IncursionEvent = {
    id: eventId,
    nodeId: node.id,
    openedAt,
    state: "resolved",
    confirmedAt,
    resolvedAt,
    speciesLabel,
    leadSignalId: leadSignal.id,
    confirmSignalId: confirmSignal.id,
    firstDeliveryAt,
  };

  const alertsForEvent = channelTargets(node.id).map((target, index): Alert => {
    const sentAt = addSeconds(confirmedAt, 1 + index);
    return {
      id: `${eventId}-alert-${target.channel}-${index}`,
      eventId,
      outageId: null,
      tier: target.tier,
      channel: target.channel,
      targetRef: target.targetRef,
      status: "delivered",
      queuedAt: confirmedAt,
      sentAt,
      deliveredAt: addSeconds(sentAt, 2),
      failedReason: null,
      isLive: false,
    };
  });

  const responderId = node.id === "n3" ? "guard-rrt-alpha" : "guard-sharma";
  const responsesForEvent: EventResponse[] = [
    {
      id: `${eventId}-ack`,
      eventId,
      responderId,
      action: "acknowledged",
      at: addSeconds(confirmedAt, 48 + (dayOffset % 6)),
    },
    {
      id: `${eventId}-on-site`,
      eventId,
      responderId,
      action: "on_site",
      at: addSeconds(confirmedAt, 8 * 60 + (dayOffset % 5) * 30),
    },
    {
      id: `${eventId}-resolved`,
      eventId,
      responderId,
      action: "resolved",
      at: resolvedAt,
    },
  ];

  return {
    event,
    signals: [leadSignal, confirmSignal],
    alerts: alertsForEvent,
    responses: responsesForEvent,
  };
}

function makeExpiredEvent(dayOffset: number): EventSeed {
  const node = seedNodes[dayOffset % seedNodes.length];
  const openedAt = isoFromIst(dayOffset, 13, (dayOffset * 11) % 50, 0);
  const eventId = `expired-${dayOffset.toString().padStart(2, "0")}-${node.id}`;
  const leadSignal: Signal = {
    id: `${eventId}-lead`,
    nodeId: node.id,
    at: openedAt,
    source: "camera",
    classification: "large_animal",
    confidence: 0.34,
    snapshotPath: "/demo-snapshots/n1-dawn-boundary.svg",
    eventId,
  };

  return {
    event: {
      id: eventId,
      nodeId: node.id,
      openedAt,
      state: "expired",
      confirmedAt: null,
      resolvedAt: null,
      speciesLabel: null,
      leadSignalId: leadSignal.id,
      confirmSignalId: null,
      firstDeliveryAt: null,
    },
    signals: [leadSignal],
    alerts: [],
    responses: [],
  };
}

function buildEventSeeds(): EventSeed[] {
  const confirmed = Array.from({ length: 30 }, (_, index) => makeConfirmedEvent(index + 1));
  const expired = [4, 9, 14, 19, 24, 29].map(makeExpiredEvent);
  return [...confirmed, ...expired];
}

function buildHeartbeats(): Heartbeat[] {
  return seedNodes.flatMap((node) =>
    Array.from({ length: 24 }, (_, index): Heartbeat => {
      const at = addSeconds("2026-07-02T09:30:00.000Z", -(23 - index) * 60 * 60);
      return {
        id: `hb-${node.id}-${index.toString().padStart(2, "0")}`,
        nodeId: node.id,
        at,
        batteryPct: Math.max(45, (node.batteryPct ?? 80) - Math.floor(index / 6)),
        linkQualityPct: Math.max(62, (node.linkQualityPct ?? 88) - ((index + node.id.length) % 9)),
      };
    }),
  );
}

function buildOutages(): Outage[] {
  return [
    {
      id: "outage-n3-2026-06-12",
      nodeId: "n3",
      startedAt: isoFromIst(20, 2, 15),
      endedAt: isoFromIst(20, 3, 5),
      opsAlerted: true,
    },
    {
      id: "outage-n1-2026-06-21",
      nodeId: "n1",
      startedAt: isoFromIst(11, 21, 40),
      endedAt: isoFromIst(11, 22, 5),
      opsAlerted: true,
    },
    {
      id: "outage-n2-2026-06-27",
      nodeId: "n2",
      startedAt: isoFromIst(5, 4, 12),
      endedAt: isoFromIst(5, 4, 27),
      opsAlerted: true,
    },
  ];
}

function upsertSignalsWithoutEvent(db: AppDatabase, rows: Signal[]): void {
  for (const row of rows) {
    db.insert(signals)
      .values({ ...row, eventId: null })
      .onConflictDoUpdate({
        target: signals.id,
        set: {
          nodeId: row.nodeId,
          at: row.at,
          source: row.source,
          classification: row.classification,
          confidence: row.confidence,
          snapshotPath: row.snapshotPath,
        },
      })
      .run();
  }
}

function upsertEvents(db: AppDatabase, rows: IncursionEvent[]): void {
  for (const row of rows) {
    db.insert(events)
      .values(row)
      .onConflictDoUpdate({
        target: events.id,
        set: row,
      })
      .run();
  }
}

function attachSignals(db: AppDatabase, rows: Signal[]): void {
  for (const row of rows) {
    db.update(signals).set({ eventId: row.eventId }).where(eq(signals.id, row.id)).run();
  }
}

function upsertAlerts(db: AppDatabase, rows: Alert[]): void {
  for (const row of rows) {
    db.insert(alerts)
      .values(row)
      .onConflictDoUpdate({
        target: alerts.id,
        set: row,
      })
      .run();
  }
}

function upsertResponses(db: AppDatabase, rows: EventResponse[]): void {
  for (const row of rows) {
    db.insert(responses)
      .values(row)
      .onConflictDoUpdate({
        target: responses.id,
        set: row,
      })
      .run();
  }
}

function upsertHeartbeats(db: AppDatabase, rows: Heartbeat[]): void {
  for (const row of rows) {
    db.insert(heartbeats)
      .values(row)
      .onConflictDoUpdate({
        target: heartbeats.id,
        set: row,
      })
      .run();
  }
}

function upsertOutages(db: AppDatabase, rows: Outage[]): void {
  for (const row of rows) {
    db.insert(outages)
      .values(row)
      .onConflictDoUpdate({
        target: outages.id,
        set: row,
      })
      .run();
  }
}

function countValue(row: { value: number } | undefined): number {
  if (row === undefined) {
    throw new Error("Expected SQLite count row");
  }
  return row.value;
}

export function readSeedSummary(db: AppDatabase): SeedSummary {
  return {
    nodes: countValue(db.select({ value: count() }).from(nodes).get()),
    villagerZones: countValue(db.select({ value: count() }).from(villagerZones).get()),
    responders: countValue(db.select({ value: count() }).from(responders).get()),
    heartbeats: countValue(db.select({ value: count() }).from(heartbeats).get()),
    signals: countValue(db.select({ value: count() }).from(signals).get()),
    events: countValue(db.select({ value: count() }).from(events).get()),
    alerts: countValue(db.select({ value: count() }).from(alerts).get()),
    responses: countValue(db.select({ value: count() }).from(responses).get()),
    outages: countValue(db.select({ value: count() }).from(outages).get()),
  };
}

export function seedDatabase(db: AppDatabase): SeedSummary {
  const repos = createRepositories(db);
  const eventSeeds = buildEventSeeds();
  const seededSignals = eventSeeds.flatMap((seed) => seed.signals);

  for (const node of seedNodes) repos.nodes.upsert(node);
  for (const zone of seedZones) repos.villagerZones.upsert(zone);
  for (const responder of seedResponders) repos.responders.upsert(responder);
  // COEXIST_ESCALATION_TIMEOUT_S shortens the auto-escalation clock for demo
  // rehearsals and tests (escalate in seconds instead of the 90s default);
  // ignored unless it parses to a positive number.
  const timeoutOverride = Number(process.env.COEXIST_ESCALATION_TIMEOUT_S);
  const escalationTimeoutS =
    Number.isFinite(timeoutOverride) && timeoutOverride > 0
      ? timeoutOverride
      : DEFAULT_SETTINGS.escalationTimeoutS;
  repos.settings.upsert({ ...DEFAULT_SETTINGS, escalationTimeoutS });

  upsertHeartbeats(db, buildHeartbeats());
  upsertSignalsWithoutEvent(db, seededSignals);
  upsertEvents(
    db,
    eventSeeds.map((seed) => seed.event),
  );
  attachSignals(db, seededSignals);
  upsertAlerts(
    db,
    eventSeeds.flatMap((seed) => seed.alerts),
  );
  upsertResponses(
    db,
    eventSeeds.flatMap((seed) => seed.responses),
  );
  upsertOutages(db, buildOutages());

  return readSeedSummary(db);
}

function isCliEntrypoint(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isCliEntrypoint()) {
  const client = createDatabaseClient();
  try {
    const summary = seedDatabase(client.db);
    process.stdout.write(`Seeded CoExist Alert demo data: ${JSON.stringify(summary)}\n`);
  } finally {
    client.close();
  }
}

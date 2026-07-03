import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";

import { DEFAULT_SETTINGS } from "@/domain/types";
import type {
  Alert,
  AlertStatus,
  EventState,
  EventResponse,
  Heartbeat,
  IncursionEvent,
  Outage,
  Responder,
  SensorNode,
  Settings,
  Signal,
  VillagerZone,
} from "@/domain/types";

import type { AppDatabase } from "./client";
import {
  alerts,
  events,
  heartbeats,
  nodes,
  outages,
  responders,
  responses,
  settings as settingsTable,
  signals,
  villagerZones,
} from "./schema";

const SETTINGS_ROW_ID = "default";
const OPEN_EVENT_STATES: Array<IncursionEvent["state"]> = [
  "unconfirmed",
  "confirmed",
  "responding",
];

function orNull<T>(row: T | undefined): T | null {
  return row ?? null;
}

export interface AlertStatusPatch {
  status: AlertStatus;
  sentAt?: string | null;
  deliveredAt?: string | null;
  failedReason?: string | null;
  isLive?: boolean;
}

export interface EventFilterOptions {
  nodeId?: string;
  state?: EventState;
  fromIso?: string;
  toIso?: string;
  limit: number;
  offset: number;
}

export function createRepositories(db: AppDatabase) {
  return {
    nodes: {
      upsert(node: SensorNode): SensorNode {
        return db
          .insert(nodes)
          .values(node)
          .onConflictDoUpdate({
            target: nodes.id,
            set: node,
          })
          .returning()
          .get();
      },

      findById(id: string): SensorNode | null {
        return orNull(db.select().from(nodes).where(eq(nodes.id, id)).get());
      },

      list(): SensorNode[] {
        return db.select().from(nodes).orderBy(asc(nodes.id)).all();
      },
    },

    heartbeats: {
      insert(heartbeat: Heartbeat): Heartbeat {
        return db.insert(heartbeats).values(heartbeat).returning().get();
      },

      listForNode(nodeId: string): Heartbeat[] {
        return db
          .select()
          .from(heartbeats)
          .where(eq(heartbeats.nodeId, nodeId))
          .orderBy(asc(heartbeats.at))
          .all();
      },

      listForNodeSince(nodeId: string, fromIso: string): Heartbeat[] {
        return db
          .select()
          .from(heartbeats)
          .where(and(eq(heartbeats.nodeId, nodeId), gte(heartbeats.at, fromIso)))
          .orderBy(asc(heartbeats.at))
          .all();
      },
    },

    signals: {
      insert(signal: Signal): Signal {
        return db.insert(signals).values(signal).returning().get();
      },

      findById(id: string): Signal | null {
        return orNull(db.select().from(signals).where(eq(signals.id, id)).get());
      },

      attachToEvent(id: string, eventId: string): Signal | null {
        return orNull(
          db
            .update(signals)
            .set({ eventId })
            .where(eq(signals.id, id))
            .returning()
            .get(),
        );
      },

      listForEvent(eventId: string): Signal[] {
        return db
          .select()
          .from(signals)
          .where(eq(signals.eventId, eventId))
          .orderBy(asc(signals.at))
          .all();
      },

      listRecent(limit: number): Signal[] {
        return db
          .select()
          .from(signals)
          .orderBy(desc(signals.at))
          .limit(limit)
          .all();
      },

      listRecentForNode(nodeId: string, limit: number): Signal[] {
        return db
          .select()
          .from(signals)
          .where(eq(signals.nodeId, nodeId))
          .orderBy(desc(signals.at))
          .limit(limit)
          .all();
      },
    },

    events: {
      insert(event: IncursionEvent): IncursionEvent {
        return db.insert(events).values(event).returning().get();
      },

      update(event: IncursionEvent): IncursionEvent {
        return db
          .update(events)
          .set(event)
          .where(eq(events.id, event.id))
          .returning()
          .get();
      },

      findById(id: string): IncursionEvent | null {
        return orNull(db.select().from(events).where(eq(events.id, id)).get());
      },

      findOpenByNode(nodeId: string): IncursionEvent | null {
        return orNull(
          db
            .select()
            .from(events)
            .where(and(eq(events.nodeId, nodeId), inArray(events.state, OPEN_EVENT_STATES)))
            .orderBy(asc(events.openedAt))
            .get(),
        );
      },

      listOpen(): IncursionEvent[] {
        return db
          .select()
          .from(events)
          .where(inArray(events.state, OPEN_EVENT_STATES))
          .orderBy(asc(events.openedAt))
          .all();
      },

      list(): IncursionEvent[] {
        return db.select().from(events).orderBy(asc(events.openedAt)).all();
      },

      listFiltered(options: EventFilterOptions): {
        items: IncursionEvent[];
        total: number;
      } {
        const conditions = [
          options.nodeId === undefined ? undefined : eq(events.nodeId, options.nodeId),
          options.state === undefined ? undefined : eq(events.state, options.state),
          options.fromIso === undefined ? undefined : gte(events.openedAt, options.fromIso),
          options.toIso === undefined ? undefined : lt(events.openedAt, options.toIso),
        ].filter((condition): condition is NonNullable<typeof condition> =>
          condition !== undefined,
        );
        const where = conditions.length === 0 ? undefined : and(...conditions);
        const total = (db
          .select({ value: count() })
          .from(events)
          .where(where)
          .get()?.value ?? 0);
        const items = db
          .select()
          .from(events)
          .where(where)
          .orderBy(desc(events.openedAt), desc(events.id))
          .limit(options.limit)
          .offset(options.offset)
          .all();

        return { items, total };
      },
    },

    alerts: {
      insert(alert: Alert): Alert {
        return db.insert(alerts).values(alert).returning().get();
      },

      updateStatus(id: string, patch: AlertStatusPatch): Alert | null {
        return orNull(
          db
            .update(alerts)
            .set(patch)
            .where(eq(alerts.id, id))
            .returning()
            .get(),
        );
      },

      listForEvent(eventId: string): Alert[] {
        return db
          .select()
          .from(alerts)
          .where(eq(alerts.eventId, eventId))
          .orderBy(asc(alerts.tier), asc(alerts.queuedAt), asc(alerts.id))
          .all();
      },

      listSince(fromIso: string): Alert[] {
        return db
          .select()
          .from(alerts)
          .where(gte(alerts.queuedAt, fromIso))
          .orderBy(asc(alerts.queuedAt))
          .all();
      },

      listForOutage(outageId: string): Alert[] {
        return db
          .select()
          .from(alerts)
          .where(eq(alerts.outageId, outageId))
          .orderBy(asc(alerts.queuedAt), asc(alerts.id))
          .all();
      },
    },

    responders: {
      upsert(responder: Responder): Responder {
        return db
          .insert(responders)
          .values(responder)
          .onConflictDoUpdate({
            target: responders.id,
            set: responder,
          })
          .returning()
          .get();
      },

      findById(id: string): Responder | null {
        return orNull(db.select().from(responders).where(eq(responders.id, id)).get());
      },

      list(): Responder[] {
        return db
          .select()
          .from(responders)
          .orderBy(asc(responders.tier), asc(responders.id))
          .all();
      },

      listForNode(nodeId: string): Responder[] {
        return this.list().filter((responder) => responder.nodeIds.includes(nodeId));
      },
    },

    villagerZones: {
      upsert(zone: VillagerZone): VillagerZone {
        return db
          .insert(villagerZones)
          .values(zone)
          .onConflictDoUpdate({
            target: villagerZones.id,
            set: zone,
          })
          .returning()
          .get();
      },

      findById(id: string): VillagerZone | null {
        return orNull(
          db.select().from(villagerZones).where(eq(villagerZones.id, id)).get(),
        );
      },

      list(): VillagerZone[] {
        return db.select().from(villagerZones).orderBy(asc(villagerZones.id)).all();
      },
    },

    responses: {
      insert(response: EventResponse): EventResponse {
        return db.insert(responses).values(response).returning().get();
      },

      listForEvent(eventId: string): EventResponse[] {
        return db
          .select()
          .from(responses)
          .where(eq(responses.eventId, eventId))
          .orderBy(asc(responses.at))
          .all();
      },
    },

    outages: {
      insert(outage: Outage): Outage {
        return db.insert(outages).values(outage).returning().get();
      },

      findOpenForNode(nodeId: string): Outage | null {
        return orNull(
          db
            .select()
            .from(outages)
            .where(and(eq(outages.nodeId, nodeId), isNull(outages.endedAt)))
            .orderBy(asc(outages.startedAt))
            .get(),
        );
      },

      close(id: string, endedAt: string): Outage | null {
        return orNull(
          db
            .update(outages)
            .set({ endedAt })
            .where(eq(outages.id, id))
            .returning()
            .get(),
        );
      },

      listForNode(nodeId: string): Outage[] {
        return db
          .select()
          .from(outages)
          .where(eq(outages.nodeId, nodeId))
          .orderBy(asc(outages.startedAt))
          .all();
      },

      listForNodeWindow(nodeId: string, fromIso: string, toIso: string): Outage[] {
        return db
          .select()
          .from(outages)
          .where(
            and(
              eq(outages.nodeId, nodeId),
              lt(outages.startedAt, toIso),
              or(isNull(outages.endedAt), gte(outages.endedAt, fromIso)),
            ),
          )
          .orderBy(asc(outages.startedAt))
          .all();
      },

      listRecent(limit: number): Outage[] {
        return db
          .select()
          .from(outages)
          .orderBy(desc(outages.startedAt))
          .limit(limit)
          .all();
      },
    },

    settings: {
      get(): Settings {
        const row = db
          .select()
          .from(settingsTable)
          .where(eq(settingsTable.id, SETTINGS_ROW_ID))
          .get();
        return row === undefined
          ? DEFAULT_SETTINGS
          : {
              confirmationWindowS: row.confirmationWindowS,
              confirmConfidence: row.confirmConfidence,
              escalationTimeoutS: row.escalationTimeoutS,
              heartbeatIntervalS: row.heartbeatIntervalS,
              degradedAfterMissed: row.degradedAfterMissed,
              offlineAfterMissed: row.offlineAfterMissed,
            };
      },

      upsert(settings: Settings): Settings {
        db.insert(settingsTable)
          .values({ id: SETTINGS_ROW_ID, ...settings })
          .onConflictDoUpdate({
            target: settingsTable.id,
            set: settings,
          })
          .run();
        return this.get();
      },
    },
  };
}

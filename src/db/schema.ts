import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import type { UserRole } from "@/auth/session";
import type {
  AlertChannel,
  AlertStatus,
  AlertTier,
  EventState,
  NodeKind,
  NodeStatus,
  ResponderRole,
  ResponseAction,
  SignalSource,
  VillagerZone,
} from "@/domain/types";

const isoText = (name: string) => text(name).notNull();

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    responderId: text("responder_id"),
    displayName: text("display_name").notNull(),
    createdAt: isoText("created_at"),
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('admin', 'command', 'guard', 'control')`),
  ],
);

export const nodes = sqliteTable(
  "nodes",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").$type<NodeKind>().notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    geofenceRadiusM: integer("geofence_radius_m").notNull(),
    status: text("status").$type<NodeStatus>().notNull(),
    batteryPct: integer("battery_pct"),
    linkQualityPct: integer("link_quality_pct"),
    lastHeartbeatAt: text("last_heartbeat_at"),
    createdAt: isoText("created_at"),
  },
  (table) => [
    check(
      "nodes_kind_check",
      sql`${table.kind} in ('village_boundary', 'rail_crossing', 'waterhole')`,
    ),
    check(
      "nodes_status_check",
      sql`${table.status} in ('healthy', 'degraded', 'offline')`,
    ),
    check("nodes_battery_range", sql`${table.batteryPct} is null or (${table.batteryPct} >= 0 and ${table.batteryPct} <= 100)`),
    check(
      "nodes_link_range",
      sql`${table.linkQualityPct} is null or (${table.linkQualityPct} >= 0 and ${table.linkQualityPct} <= 100)`,
    ),
    index("nodes_status_idx").on(table.status),
  ],
);

export const signals = sqliteTable(
  "signals",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id),
    at: isoText("at"),
    source: text("source").$type<SignalSource>().notNull(),
    classification: text("classification").notNull(),
    confidence: real("confidence").notNull(),
    snapshotPath: text("snapshot_path"),
    eventId: text("event_id").references((): AnySQLiteColumn => events.id),
  },
  (table) => [
    check(
      "signals_source_check",
      sql`${table.source} in ('camera', 'thermal', 'acoustic', 'motion')`,
    ),
    check("signals_confidence_range", sql`${table.confidence} >= 0 and ${table.confidence} <= 1`),
    index("signals_node_at_idx").on(table.nodeId, table.at),
    index("signals_event_idx").on(table.eventId),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id),
    openedAt: isoText("opened_at"),
    state: text("state").$type<EventState>().notNull(),
    confirmedAt: text("confirmed_at"),
    resolvedAt: text("resolved_at"),
    speciesLabel: text("species_label"),
    leadSignalId: text("lead_signal_id")
      .notNull()
      .references((): AnySQLiteColumn => signals.id),
    confirmSignalId: text("confirm_signal_id").references((): AnySQLiteColumn => signals.id),
    firstDeliveryAt: text("first_delivery_at"),
  },
  (table) => [
    check(
      "events_state_check",
      sql`${table.state} in ('unconfirmed', 'confirmed', 'expired', 'responding', 'resolved')`,
    ),
    index("events_node_state_idx").on(table.nodeId, table.state),
    index("events_opened_at_idx").on(table.openedAt),
  ],
);

export const heartbeats = sqliteTable(
  "heartbeats",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id),
    at: isoText("at"),
    batteryPct: integer("battery_pct").notNull(),
    linkQualityPct: integer("link_quality_pct").notNull(),
  },
  (table) => [
    check("heartbeats_battery_range", sql`${table.batteryPct} >= 0 and ${table.batteryPct} <= 100`),
    check(
      "heartbeats_link_range",
      sql`${table.linkQualityPct} >= 0 and ${table.linkQualityPct} <= 100`,
    ),
    index("heartbeats_node_at_idx").on(table.nodeId, table.at),
  ],
);

export const responders = sqliteTable(
  "responders",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    role: text("role").$type<ResponderRole>().notNull(),
    tier: integer("tier").$type<AlertTier>().notNull(),
    webexEmail: text("webex_email"),
    phoneLabel: text("phone_label").notNull(),
    nodeIds: text("node_ids", { mode: "json" }).$type<string[]>().notNull(),
  },
  (table) => [
    check(
      "responders_role_check",
      sql`${table.role} in ('guard', 'control_room', 'district_officer')`,
    ),
    check("responders_tier_check", sql`${table.tier} in (1, 2, 3)`),
    check("responders_node_ids_json", sql`json_valid(${table.nodeIds})`),
    index("responders_role_tier_idx").on(table.role, table.tier),
  ],
);

export const villagerZones = sqliteTable(
  "villager_zones",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
  },
  (table) => [index("villager_zones_label_idx").on(table.label)],
);

export const alerts = sqliteTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .references(() => events.id),
    outageId: text("outage_id").references((): AnySQLiteColumn => outages.id),
    tier: integer("tier").$type<AlertTier>().notNull(),
    channel: text("channel").$type<AlertChannel>().notNull(),
    targetRef: text("target_ref").notNull(),
    status: text("status").$type<AlertStatus>().notNull(),
    queuedAt: isoText("queued_at"),
    sentAt: text("sent_at"),
    deliveredAt: text("delivered_at"),
    failedReason: text("failed_reason"),
    isLive: integer("is_live", { mode: "boolean" }).notNull(),
  },
  (table) => [
    check("alerts_tier_check", sql`${table.tier} in (1, 2, 3)`),
    check(
      "alerts_channel_check",
      sql`${table.channel} in ('siren', 'villager_phone', 'guard_webex', 'control_room', 'blindspot_ops')`,
    ),
    check(
      "alerts_status_check",
      sql`${table.status} in ('queued', 'sent', 'delivered', 'failed', 'acked')`,
    ),
    check(
      "alerts_subject_check",
      sql`(${table.eventId} is not null and ${table.outageId} is null) or (${table.eventId} is null and ${table.outageId} is not null)`,
    ),
    index("alerts_event_tier_idx").on(table.eventId, table.tier),
    index("alerts_outage_idx").on(table.outageId),
    index("alerts_status_idx").on(table.status),
  ],
);

export const responses = sqliteTable(
  "responses",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    responderId: text("responder_id")
      .notNull()
      .references(() => responders.id),
    action: text("action").$type<ResponseAction>().notNull(),
    at: isoText("at"),
  },
  (table) => [
    check(
      "responses_action_check",
      sql`${table.action} in ('acknowledged', 'en_route', 'on_site', 'resolved')`,
    ),
    index("responses_event_at_idx").on(table.eventId, table.at),
    index("responses_responder_idx").on(table.responderId),
  ],
);

export const outages = sqliteTable(
  "outages",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id),
    startedAt: isoText("started_at"),
    endedAt: text("ended_at"),
    opsAlerted: integer("ops_alerted", { mode: "boolean" }).notNull(),
  },
  (table) => [
    index("outages_node_started_idx").on(table.nodeId, table.startedAt),
    index("outages_open_idx").on(table.nodeId, table.endedAt),
  ],
);

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  confirmationWindowS: integer("confirmation_window_s").notNull(),
  confirmConfidence: real("confirm_confidence").notNull(),
  escalationTimeoutS: integer("escalation_timeout_s").notNull(),
  heartbeatIntervalS: integer("heartbeat_interval_s").notNull(),
  degradedAfterMissed: integer("degraded_after_missed").notNull(),
  offlineAfterMissed: integer("offline_after_missed").notNull(),
});

export const schema = {
  alerts,
  events,
  heartbeats,
  nodes,
  outages,
  responders,
  responses,
  settings,
  signals,
  users,
  villagerZones,
};

export type VillagerZoneRow = typeof villagerZones.$inferSelect & VillagerZone;

/**
 * Domain types for the CoExist Alert pipeline.
 *
 * Everything in src/domain/ is pure and I/O-free: engines receive plain data
 * and return decisions; persistence and delivery live elsewhere. Timestamps
 * are ISO-8601 UTC strings throughout (rendered in IST at the UI layer).
 */

export type NodeKind = "village_boundary" | "rail_crossing" | "waterhole";
export type NodeStatus = "healthy" | "degraded" | "offline";
export type SignalSource = "camera" | "thermal" | "acoustic" | "motion";
export type EventState =
  | "unconfirmed"
  | "confirmed"
  | "expired"
  | "responding"
  | "resolved";
export type AlertChannel =
  | "siren"
  | "villager_phone"
  | "guard_webex"
  | "control_room"
  | "blindspot_ops";
export type AlertStatus = "queued" | "sent" | "delivered" | "failed" | "acked";
export type ResponderRole = "guard" | "control_room" | "district_officer";
export type ResponseAction = "acknowledged" | "en_route" | "on_site" | "resolved";
export type AlertTier = 1 | 2 | 3;

export interface SensorNode {
  id: string;
  name: string;
  kind: NodeKind;
  lat: number;
  lng: number;
  /** Alert targeting radius around the node. */
  geofenceRadiusM: number;
  status: NodeStatus;
  batteryPct: number | null;
  linkQualityPct: number | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
}

export interface Heartbeat {
  id: string;
  nodeId: string;
  at: string;
  batteryPct: number;
  linkQualityPct: number;
}

/** Raw detection signal from the (simulated) edge — arrives pre-classified. */
export interface Signal {
  id: string;
  nodeId: string;
  at: string;
  source: SignalSource;
  classification: string;
  /** 0..1 as reported by the edge device. */
  confidence: number;
  snapshotPath: string | null;
  /** Set when the signal is attached to an event. */
  eventId: string | null;
}

/** A confirmed-or-pending incursion at a node. */
export interface IncursionEvent {
  id: string;
  nodeId: string;
  openedAt: string;
  state: EventState;
  confirmedAt: string | null;
  resolvedAt: string | null;
  speciesLabel: string | null;
  leadSignalId: string;
  confirmSignalId: string | null;
  /** Denormalized for the lead-time KPI: first successful delivery. */
  firstDeliveryAt: string | null;
}

/** One row per channel dispatch attempt. */
export interface Alert {
  id: string;
  eventId: string | null;
  outageId: string | null;
  tier: AlertTier;
  channel: AlertChannel;
  /** Responder id / zone label / room id, depending on channel. */
  targetRef: string;
  status: AlertStatus;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedReason: string | null;
  /** True only for real Webex sends. */
  isLive: boolean;
}

/** A hamlet / settlement that can receive villager phone alerts. */
export interface VillagerZone {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface Responder {
  id: string;
  name: string;
  role: ResponderRole;
  tier: AlertTier;
  webexEmail: string | null;
  phoneLabel: string;
  /** Assigned nodes; targeting = assignment ∩ geofence. */
  nodeIds: string[];
}

/** The ack loop: responder actions against an event. */
export interface EventResponse {
  id: string;
  eventId: string;
  responderId: string;
  action: ResponseAction;
  at: string;
}

/** Blind-spot ledger entry. */
export interface Outage {
  id: string;
  nodeId: string;
  startedAt: string;
  endedAt: string | null;
  opsAlerted: boolean;
}

export interface Settings {
  confirmationWindowS: number;
  confirmConfidence: number;
  escalationTimeoutS: number;
  heartbeatIntervalS: number;
  degradedAfterMissed: number;
  offlineAfterMissed: number;
}

export const DEFAULT_SETTINGS: Settings = {
  confirmationWindowS: 45,
  confirmConfidence: 0.85,
  escalationTimeoutS: 90,
  heartbeatIntervalS: 10,
  degradedAfterMissed: 2,
  offlineAfterMissed: 4,
};

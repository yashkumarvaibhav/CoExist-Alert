import type { NodeStatus, Settings } from "./types";

/**
 * Node health state machine — pure decisions, no I/O.
 *
 * Rules (ARCHITECTURE §3): missing `degradedAfterMissed` heartbeats or a
 * battery below LOW_BATTERY_PCT degrades a node; missing `offlineAfterMissed`
 * takes it offline, which opens an outage (blind-spot ledger) and fires the
 * blindspot_ops alert exactly once. A fresh heartbeat recovers the node and
 * closes any open outage — data flowing means the corridor is watched again.
 */

export const LOW_BATTERY_PCT = 20;

export type HealthSettings = Pick<
  Settings,
  "heartbeatIntervalS" | "degradedAfterMissed" | "offlineAfterMissed"
>;

export interface HealthState {
  status: NodeStatus;
  lastHeartbeatAt: string | null;
  batteryPct: number | null;
  outageOpen: boolean;
}

export interface HealthEffects {
  /** True when status or outage bookkeeping changed. */
  changed: boolean;
  /** Caller inserts an outages row (startedAt = now). */
  openOutage: boolean;
  /** Caller closes the open outages row (endedAt = now). */
  closeOutage: boolean;
  /** Caller dispatches the blindspot_ops alert — fired exactly once per outage. */
  fireBlindspotAlert: boolean;
}

export interface HealthResult {
  state: HealthState;
  effects: HealthEffects;
}

const NO_EFFECTS: HealthEffects = {
  changed: false,
  openOutage: false,
  closeOutage: false,
  fireBlindspotAlert: false,
};

export function missedHeartbeats(
  lastHeartbeatAt: string,
  nowIso: string,
  settings: HealthSettings,
): number {
  const elapsedMs = new Date(nowIso).getTime() - new Date(lastHeartbeatAt).getTime();
  if (elapsedMs <= 0) return 0;
  return Math.floor(elapsedMs / (settings.heartbeatIntervalS * 1000));
}

function statusFrom(missed: number, batteryPct: number | null, settings: HealthSettings): NodeStatus {
  if (missed >= settings.offlineAfterMissed) return "offline";
  if (missed >= settings.degradedAfterMissed) return "degraded";
  if (batteryPct !== null && batteryPct < LOW_BATTERY_PCT) return "degraded";
  return "healthy";
}

function resolve(state: HealthState, status: NodeStatus): HealthResult {
  const openOutage = status === "offline" && !state.outageOpen;
  const closeOutage = status !== "offline" && state.outageOpen;
  const outageOpen = status === "offline";
  const changed = status !== state.status || openOutage || closeOutage;
  return {
    state: { ...state, status, outageOpen },
    effects: {
      changed,
      openOutage,
      closeOutage,
      // The blind-spot alert accompanies the outage opening, never a re-check.
      fireBlindspotAlert: openOutage,
    },
  };
}

/**
 * Timeout sweep: re-derive status from the last known heartbeat and battery.
 * A node that has never sent a heartbeat cannot be evaluated (pre-provisioning
 * time is not an outage).
 */
export function evaluateHealth(
  state: HealthState,
  nowIso: string,
  settings: HealthSettings,
): HealthResult {
  if (state.lastHeartbeatAt === null) {
    return { state, effects: NO_EFFECTS };
  }
  const missed = missedHeartbeats(state.lastHeartbeatAt, nowIso, settings);
  return resolve(state, statusFrom(missed, state.batteryPct, settings));
}

/**
 * A heartbeat arrived: the node is reachable, so only the battery rule can
 * keep it below healthy. Closes any open outage. Older-than-known (out of
 * order) beats are ignored.
 */
export function applyHeartbeat(
  state: HealthState,
  heartbeat: { at: string; batteryPct: number; linkQualityPct: number },
  settings: HealthSettings,
): HealthResult {
  if (
    state.lastHeartbeatAt !== null &&
    new Date(heartbeat.at).getTime() < new Date(state.lastHeartbeatAt).getTime()
  ) {
    return { state, effects: NO_EFFECTS };
  }
  const fresh: HealthState = {
    ...state,
    lastHeartbeatAt: heartbeat.at,
    batteryPct: heartbeat.batteryPct,
  };
  return resolve(fresh, statusFrom(0, heartbeat.batteryPct, settings));
}

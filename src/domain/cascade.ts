import { haversineMeters } from "./geo";
import type {
  AlertChannel,
  AlertTier,
  Responder,
  SensorNode,
  Settings,
  VillagerZone,
} from "./types";

/**
 * Alert cascade planner + escalation logic — pure decisions, no I/O.
 *
 * Targeting (ARCHITECTURE §3): villagers = zones inside the node geofence;
 * guards = responders assigned to the node, tier-ordered; rail_crossing
 * events ALWAYS include the control room at tier 1. Escalation: no ack
 * within `escalationTimeoutS` of the latest dispatch ⇒ next tier, max 3.
 */

export interface PlannedAlert {
  channel: AlertChannel;
  targetRef: string;
  tier: AlertTier;
}

export interface ConfirmedEventInput {
  id: string;
  nodeId: string;
  confirmedAt: string;
  speciesLabel: string | null;
}

/**
 * Plan the full alert set for a confirmed event. Tier 1 is dispatched
 * immediately by the runtime; higher tiers are held for escalation.
 * Output order is deterministic: siren, villagers (by zone id), guards
 * (tier, then id), control room.
 */
export function planCascade(
  event: ConfirmedEventInput,
  node: SensorNode,
  zones: VillagerZone[],
  responders: Responder[],
): PlannedAlert[] {
  const plan: PlannedAlert[] = [{ channel: "siren", targetRef: node.id, tier: 1 }];

  const inGeofence = zones
    .filter(
      (z) =>
        haversineMeters(z.lat, z.lng, node.lat, node.lng) <= node.geofenceRadiusM,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const zone of inGeofence) {
    plan.push({ channel: "villager_phone", targetRef: zone.id, tier: 1 });
  }

  const guards = responders
    .filter((r) => r.role === "guard" && r.nodeIds.includes(node.id))
    .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
  for (const guard of guards) {
    plan.push({ channel: "guard_webex", targetRef: guard.id, tier: guard.tier });
  }

  // A train cannot swerve: rail crossings page section control first, always.
  if (node.kind === "rail_crossing") {
    const controlRooms = responders
      .filter((r) => r.role === "control_room")
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const room of controlRooms) {
      plan.push({ channel: "control_room", targetRef: room.id, tier: 1 });
    }
  }

  return plan;
}

export interface EscalationInput {
  /** When the highest tier so far was dispatched. */
  lastDispatchAt: string;
  highestDispatchedTier: AlertTier;
  /** True once any responder acknowledged the event. */
  acknowledged: boolean;
  now: string;
  settings: Pick<Settings, "escalationTimeoutS">;
}

export type EscalationDecision =
  | { kind: "wait"; nextCheckAt: string }
  | { kind: "escalate"; toTier: 2 | 3 }
  | { kind: "stop"; reason: "acknowledged" | "max_tier" };

export function planEscalation(input: EscalationInput): EscalationDecision {
  if (input.acknowledged) return { kind: "stop", reason: "acknowledged" };
  if (input.highestDispatchedTier >= 3) return { kind: "stop", reason: "max_tier" };

  const dueAtMs =
    new Date(input.lastDispatchAt).getTime() +
    input.settings.escalationTimeoutS * 1000;
  if (new Date(input.now).getTime() >= dueAtMs) {
    return { kind: "escalate", toTier: (input.highestDispatchedTier + 1) as 2 | 3 };
  }
  return { kind: "wait", nextCheckAt: new Date(dueAtMs).toISOString() };
}

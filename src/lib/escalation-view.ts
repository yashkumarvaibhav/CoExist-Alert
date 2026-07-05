import type { AlertTier } from "@/domain/types";

/**
 * Read-only escalation view derived from an event's dispatched alerts and
 * responses. The escalation *engine* lives server-side (escalation/runtime);
 * these pure helpers let every persona surface show, honestly and without new
 * state, how far an event has climbed the responder ladder and whether an
 * acknowledgement arrived only after it escalated. Tier 1 is the first-line
 * responder; tiers 2 and 3 are the escalation targets.
 */

export interface TieredAlert {
  tier: AlertTier;
  queuedAt: string;
}

export interface AckResponse {
  action: string;
  at: string;
}

/** The highest tier that has actually been dispatched for the event (min 1). */
export function highestDispatchedTier(alerts: readonly TieredAlert[]): AlertTier {
  let highest: AlertTier = 1;
  for (const alert of alerts) {
    if (alert.tier > highest) highest = alert.tier;
  }
  return highest;
}

/** When the event first climbed past tier 1, or null if it never did. */
export function firstEscalatedAt(alerts: readonly TieredAlert[]): string | null {
  let earliest: string | null = null;
  for (const alert of alerts) {
    if (alert.tier < 2) continue;
    if (earliest === null || alert.queuedAt < earliest) earliest = alert.queuedAt;
  }
  return earliest;
}

export interface EscalationStatus {
  tier: AlertTier;
  escalated: boolean;
  firstEscalatedAt: string | null;
}

/** Summary of how far the event has escalated. `escalated` = reached tier ≥ 2. */
export function escalationStatus(alerts: readonly TieredAlert[]): EscalationStatus {
  const tier = highestDispatchedTier(alerts);
  return { tier, escalated: tier >= 2, firstEscalatedAt: firstEscalatedAt(alerts) };
}

/**
 * Whether the event has escalated to (or past) a given responder tier — the
 * signal a tier-2/3 console uses to raise an "escalated to you" takeover.
 * First-line responders (tier 1) are never escalation targets.
 */
export function isEscalatedToTier(
  alerts: readonly TieredAlert[],
  responderTier: AlertTier,
): boolean {
  if (responderTier < 2) return false;
  return highestDispatchedTier(alerts) >= responderTier;
}

/** A dispatched alert's routing target — who it actually paged. */
export interface TargetedAlert {
  targetRef: string;
}

/**
 * Whether a responder may act on the event yet. First-line responders (tier 1)
 * always own first response; escalation tiers (2–3) hold read-only situational
 * awareness until an alert has actually *paged them* — either because they are
 * the node's own first-line target (a range officer can be first-line on a
 * remote node) or because the ladder escalated to their tier. Gating on the
 * dispatched target, not on the tier number, is what stops a senior from
 * short-circuiting the ladder while still letting them act where they are the
 * assigned responder.
 */
export function canRespondToEvent(
  responder: { id: string; tier: AlertTier },
  alerts: readonly TargetedAlert[],
): boolean {
  if (responder.tier <= 1) return true;
  return alerts.some((alert) => alert.targetRef === responder.id);
}

/**
 * Whether the acknowledgement (if any) landed only after the event had already
 * escalated — used to tag a first-line responder's late ack. False when there
 * is no ack or the event never escalated.
 */
export function isAckAfterEscalation(
  responses: readonly AckResponse[],
  alerts: readonly TieredAlert[],
): boolean {
  const escalatedAt = firstEscalatedAt(alerts);
  if (escalatedAt === null) return false;
  const ack = responses.find((response) => response.action === "acknowledged");
  if (ack === undefined) return false;
  return ack.at >= escalatedAt;
}

/** A responder action, for deriving incident ownership. */
export interface OwnershipResponse {
  responderId: string;
  action: string;
  at: string;
}

/**
 * The responder who currently owns the incident: the most recent acknowledger,
 * or null before anyone acknowledges. A senior "take over" is simply a fresh
 * acknowledgement, so the latest ack always names the current owner.
 */
export function currentOwnerId(responses: readonly OwnershipResponse[]): string | null {
  let ownerId: string | null = null;
  let latestAt = "";
  for (const response of responses) {
    if (response.action === "acknowledged" && response.at > latestAt) {
      latestAt = response.at;
      ownerId = response.responderId;
    }
  }
  return ownerId;
}

/**
 * Whether a responder may progress the incident (en route / on site / resolve).
 * Until someone acknowledges there is no owner to lock against, so it is open;
 * once someone acknowledges, only that owner may progress — everyone else is
 * read-only until they explicitly take over.
 */
export function canProgressIncident(
  responderId: string,
  responses: readonly OwnershipResponse[],
): boolean {
  const ownerId = currentOwnerId(responses);
  return ownerId === null || ownerId === responderId;
}

/**
 * Whether a responder may take over an incident owned by someone else: there is
 * an owner, it is not them, and an alert has actually paged them (so a senior
 * cannot grab an incident that never escalated to their tier).
 */
export function canTakeOverIncident(
  responder: { id: string; tier: AlertTier },
  responses: readonly OwnershipResponse[],
  alerts: readonly TargetedAlert[],
): boolean {
  const ownerId = currentOwnerId(responses);
  return ownerId !== null && ownerId !== responder.id && canRespondToEvent(responder, alerts);
}

/** The ladder rung a responder tier represents, for human-facing copy. */
export function tierLabel(tier: AlertTier): string {
  switch (tier) {
    case 1:
      return "first response";
    case 2:
      return "rapid response";
    case 3:
      return "district duty";
  }
}

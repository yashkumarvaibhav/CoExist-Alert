import { randomUUID } from "node:crypto";

import { planCascade } from "@/domain/cascade";
import type { PlannedAlert } from "@/domain/cascade";
import type { Alert, IncursionEvent, Outage } from "@/domain/types";
import type { createRepositories } from "@/db/repositories";
import type { StreamEventDraft } from "@/stream/events";

import { adapterForChannel, type DeliveryResult } from "./adapters";

type Repositories = ReturnType<typeof createRepositories>;

export interface DispatchOutcome {
  alerts: Alert[];
  streamEvents: StreamEventDraft[];
}

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function dispatchKey(alert: Pick<Alert, "channel" | "targetRef" | "tier">): string {
  return `${alert.tier}:${alert.channel}:${alert.targetRef}`;
}

function deliveryEventAt(result: DeliveryResult): string {
  return result.deliveredAt ?? result.sentAt;
}

function applyDelivery(alert: Alert, result: DeliveryResult): Alert {
  return {
    ...alert,
    status: result.status,
    sentAt: result.sentAt,
    deliveredAt: result.deliveredAt,
    failedReason: result.failedReason,
    isLive: result.isLive,
  };
}

function updateFirstDeliveryAt(
  repos: Repositories,
  eventId: string | null,
  deliveredAt: string | null,
): void {
  if (eventId === null || deliveredAt === null) return;
  const event = repos.events.findById(eventId);
  if (event === null) return;
  if (event.firstDeliveryAt !== null && event.firstDeliveryAt <= deliveredAt) return;
  repos.events.update({ ...event, firstDeliveryAt: deliveredAt });
}

function dispatchAlert(repos: Repositories, alert: Alert): DispatchOutcome {
  const queued = repos.alerts.insert(alert);
  const result = adapterForChannel(queued.channel).dispatch(queued);
  const delivered =
    repos.alerts.updateStatus(queued.id, {
      status: result.status,
      sentAt: result.sentAt,
      deliveredAt: result.deliveredAt,
      failedReason: result.failedReason,
      isLive: result.isLive,
    }) ?? applyDelivery(queued, result);

  updateFirstDeliveryAt(repos, delivered.eventId, delivered.deliveredAt);

  return {
    alerts: [delivered],
    streamEvents: [
      { type: "alert", at: queued.queuedAt, payload: queued },
      { type: "delivery", at: deliveryEventAt(result), payload: delivered },
    ],
  };
}

function mergeOutcomes(outcomes: DispatchOutcome[]): DispatchOutcome {
  return {
    alerts: outcomes.flatMap((outcome) => outcome.alerts),
    streamEvents: outcomes.flatMap((outcome) => outcome.streamEvents),
  };
}

export function dispatchCascadeForEvent(
  repos: Repositories,
  eventId: string,
  queuedAt: string,
): DispatchOutcome {
  const event = repos.events.findById(eventId);
  if (event === null || event.confirmedAt === null) {
    return { alerts: [], streamEvents: [] };
  }

  const node = repos.nodes.findById(event.nodeId);
  if (node === null) {
    return { alerts: [], streamEvents: [] };
  }

  const existing = new Set(repos.alerts.listForEvent(event.id).map(dispatchKey));
  const planned = planCascade(
    {
      id: event.id,
      nodeId: event.nodeId,
      confirmedAt: event.confirmedAt,
      speciesLabel: event.speciesLabel,
    },
    node,
    repos.villagerZones.list(),
    repos.responders.list(),
  ).filter((alert) => alert.tier === 1);

  const outcomes: DispatchOutcome[] = [];
  for (const target of planned) {
    if (existing.has(dispatchKey(target))) continue;
    outcomes.push(
      dispatchAlert(repos, {
        id: makeId("alt"),
        eventId: event.id,
        outageId: null,
        tier: target.tier,
        channel: target.channel,
        targetRef: target.targetRef,
        status: "queued",
        queuedAt,
        sentAt: null,
        deliveredAt: null,
        failedReason: null,
        isLive: false,
      }),
    );
  }

  return mergeOutcomes(outcomes);
}

export function dispatchPlannedTier(
  repos: Repositories,
  event: IncursionEvent,
  targets: PlannedAlert[],
  queuedAt: string,
): DispatchOutcome {
  const existing = new Set(repos.alerts.listForEvent(event.id).map(dispatchKey));
  return mergeOutcomes(
    targets
      .filter((target) => !existing.has(dispatchKey(target)))
      .map((target) =>
        dispatchAlert(repos, {
          id: makeId("alt"),
          eventId: event.id,
          outageId: null,
          tier: target.tier,
          channel: target.channel,
          targetRef: target.targetRef,
          status: "queued",
          queuedAt,
          sentAt: null,
          deliveredAt: null,
          failedReason: null,
          isLive: false,
        }),
      ),
  );
}

export function dispatchBlindspotAlert(
  repos: Repositories,
  outage: Outage,
  queuedAt: string,
): DispatchOutcome {
  if (!outage.opsAlerted) {
    return { alerts: [], streamEvents: [] };
  }

  const alreadyDispatched = repos.alerts
    .listForOutage(outage.id)
    .some((alert) => alert.channel === "blindspot_ops");
  if (alreadyDispatched) {
    return { alerts: [], streamEvents: [] };
  }

  return dispatchAlert(repos, {
    id: makeId("alt"),
    eventId: null,
    outageId: outage.id,
    tier: 1,
    channel: "blindspot_ops",
    targetRef: outage.nodeId,
    status: "queued",
    queuedAt,
    sentAt: null,
    deliveredAt: null,
    failedReason: null,
    isLive: false,
  });
}

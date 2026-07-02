import { randomUUID } from "node:crypto";

import { planCascade } from "@/domain/cascade";
import type { PlannedAlert } from "@/domain/cascade";
import type { Alert, IncursionEvent, Outage, SensorNode } from "@/domain/types";
import type { createRepositories } from "@/db/repositories";
import type { StreamEventDraft } from "@/stream/events";

import { adapterForChannel, type DeliveryContext, type DeliveryResult } from "./adapters";

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

function deliveryContext(
  repos: Repositories,
  event: IncursionEvent | null,
  node: SensorNode | null,
  targetRef: string,
): DeliveryContext {
  return {
    event,
    node,
    responder: targetRef === "" ? null : repos.responders.findById(targetRef),
    signals: event === null ? [] : repos.signals.listForEvent(event.id),
  };
}

async function dispatchAlert(
  repos: Repositories,
  alert: Alert,
  context: DeliveryContext,
): Promise<DispatchOutcome> {
  const queued = repos.alerts.insert(alert);
  const result = await adapterForChannel(queued.channel).dispatch(queued, context);
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

export async function dispatchCascadeForEvent(
  repos: Repositories,
  eventId: string,
  queuedAt: string,
): Promise<DispatchOutcome> {
  const event = repos.events.findById(eventId);
  if (event === null || event.confirmedAt === null) {
    return Promise.resolve({ alerts: [], streamEvents: [] });
  }

  const node = repos.nodes.findById(event.nodeId);
  if (node === null) {
    return Promise.resolve({ alerts: [], streamEvents: [] });
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
      await dispatchAlert(
        repos,
        {
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
        },
        deliveryContext(repos, event, node, target.targetRef),
      ),
    );
  }

  return mergeOutcomes(outcomes);
}

export function dispatchPlannedTier(
  repos: Repositories,
  event: IncursionEvent,
  targets: PlannedAlert[],
  queuedAt: string,
): Promise<DispatchOutcome> {
  const existing = new Set(repos.alerts.listForEvent(event.id).map(dispatchKey));
  const node = repos.nodes.findById(event.nodeId);
  return Promise.all(
    targets
      .filter((target) => !existing.has(dispatchKey(target)))
      .map((target) =>
        dispatchAlert(
          repos,
          {
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
          },
          deliveryContext(repos, event, node, target.targetRef),
        ),
      ),
  ).then(mergeOutcomes);
}

export function dispatchBlindspotAlert(
  repos: Repositories,
  outage: Outage,
  queuedAt: string,
): Promise<DispatchOutcome> {
  if (!outage.opsAlerted) {
    return Promise.resolve({ alerts: [], streamEvents: [] });
  }

  const alreadyDispatched = repos.alerts
    .listForOutage(outage.id)
    .some((alert) => alert.channel === "blindspot_ops");
  if (alreadyDispatched) {
    return Promise.resolve({ alerts: [], streamEvents: [] });
  }

  const node = repos.nodes.findById(outage.nodeId);
  return dispatchAlert(
    repos,
    {
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
    },
    deliveryContext(repos, null, node, ""),
  );
}

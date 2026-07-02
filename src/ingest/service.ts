import { randomUUID } from "node:crypto";
import { z } from "zod";

import { dispatchBlindspotAlert, dispatchCascadeForEvent } from "@/channels/dispatch";
import { evaluateExpiry, processSignal, type PendingEvent } from "@/domain/confirmation";
import {
  applyHeartbeat,
  evaluateHealth,
  type HealthEffects,
  type HealthState,
} from "@/domain/health";
import type { IncursionEvent, Outage, Signal } from "@/domain/types";
import type { createRepositories } from "@/db/repositories";
import type { StreamEventDraft } from "@/stream/events";

type Repositories = ReturnType<typeof createRepositories>;

const SIGNAL_SOURCES = ["camera", "thermal", "acoustic", "motion"] as const;

const utcIso = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

export const heartbeatPayloadSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    at: utcIso,
    batteryPct: z.number().int().min(0).max(100),
    linkQualityPct: z.number().int().min(0).max(100),
  })
  .strict();

export const detectionPayloadSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    at: utcIso,
    source: z.enum(SIGNAL_SOURCES),
    classification: z.string().trim().min(1).max(80),
    confidence: z.number().min(0).max(1),
    snapshotRef: z.string().trim().min(1).max(240).optional().nullable(),
  })
  .strict()
  .transform((payload) => ({
    ...payload,
    snapshotRef: payload.snapshotRef ?? null,
  }));

export type HeartbeatPayload = z.infer<typeof heartbeatPayloadSchema>;
export type DetectionPayload = z.infer<typeof detectionPayloadSchema>;

export class IngestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

const NO_EFFECTS: HealthEffects = {
  changed: false,
  openOutage: false,
  closeOutage: false,
  fireBlindspotAlert: false,
};

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function mergeEffects(...effects: HealthEffects[]): HealthEffects {
  return effects.reduce<HealthEffects>(
    (merged, effect) => ({
      changed: merged.changed || effect.changed,
      openOutage: merged.openOutage || effect.openOutage,
      closeOutage: merged.closeOutage || effect.closeOutage,
      fireBlindspotAlert: merged.fireBlindspotAlert || effect.fireBlindspotAlert,
    }),
    NO_EFFECTS,
  );
}

function healthStateFrom(node: {
  status: HealthState["status"];
  lastHeartbeatAt: string | null;
  batteryPct: number | null;
}, outageOpen: boolean): HealthState {
  return {
    status: node.status,
    lastHeartbeatAt: node.lastHeartbeatAt,
    batteryPct: node.batteryPct,
    outageOpen,
  };
}

function applyHealthEffects(
  repos: Repositories,
  nodeId: string,
  at: string,
  effects: HealthEffects,
  openOutage: Outage | null,
): {
  openOutage: Outage | null;
  touchedOutageId: string | null;
  outageEvents: Outage[];
} {
  let currentOpenOutage = openOutage;
  let touchedOutageId: string | null = null;
  const outageEvents: Outage[] = [];

  if (effects.openOutage) {
    currentOpenOutage = repos.outages.insert({
      id: makeId("out"),
      nodeId,
      startedAt: at,
      endedAt: null,
      opsAlerted: effects.fireBlindspotAlert,
    });
    touchedOutageId = currentOpenOutage.id;
    outageEvents.push(currentOpenOutage);
  }

  if (effects.closeOutage && currentOpenOutage !== null) {
    const closed = repos.outages.close(currentOpenOutage.id, at);
    touchedOutageId = closed?.id ?? currentOpenOutage.id;
    if (closed !== null) {
      outageEvents.push(closed);
    }
    currentOpenOutage = null;
  }

  return { openOutage: currentOpenOutage, touchedOutageId, outageEvents };
}

async function dispatchBlindspotAlerts(
  repos: Repositories,
  outageEvents: Outage[],
  at: string,
): Promise<StreamEventDraft[]> {
  const outcomes = await Promise.all(
    outageEvents
    .filter((outage) => outage.endedAt === null)
      .map((outage) => dispatchBlindspotAlert(repos, outage, at)),
  );
  return outcomes.flatMap((outcome) => outcome.streamEvents);
}

export interface HeartbeatIngestOutcome {
  heartbeatId: string;
  nodeId: string;
  status: HealthState["status"];
  effects: HealthEffects;
  outageId: string | null;
  streamEvents: StreamEventDraft[];
}

export async function ingestHeartbeat(
  repos: Repositories,
  payload: HeartbeatPayload,
): Promise<HeartbeatIngestOutcome> {
  const node = repos.nodes.findById(payload.nodeId);
  if (node === null) {
    throw new IngestError(404, "node_not_found", "Unknown sensor node.");
  }

  const settings = repos.settings.get();
  let openOutage = repos.outages.findOpenForNode(node.id);
  const initialState = healthStateFrom(node, openOutage !== null);

  const sweep = evaluateHealth(initialState, payload.at, settings);
  const sweepEffects = applyHealthEffects(
    repos,
    node.id,
    payload.at,
    sweep.effects,
    openOutage,
  );
  openOutage = sweepEffects.openOutage;

  const heartbeat = {
    id: makeId("hb"),
    nodeId: node.id,
    at: payload.at,
    batteryPct: payload.batteryPct,
    linkQualityPct: payload.linkQualityPct,
  };
  repos.heartbeats.insert(heartbeat);

  const applied = applyHeartbeat(sweep.state, payload, settings);
  const heartbeatEffects = applyHealthEffects(
    repos,
    node.id,
    payload.at,
    applied.effects,
    openOutage,
  );

  const acceptedHeartbeat = applied.state.lastHeartbeatAt === payload.at;
  const updatedNode = repos.nodes.upsert({
    ...node,
    status: applied.state.status,
    batteryPct: applied.state.batteryPct,
    linkQualityPct: acceptedHeartbeat ? payload.linkQualityPct : node.linkQualityPct,
    lastHeartbeatAt: applied.state.lastHeartbeatAt,
  });

  const effects = mergeEffects(sweep.effects, applied.effects);
  const streamEvents: StreamEventDraft[] = [];
  if (effects.changed) {
    streamEvents.push({
      type: "node-status",
      at: payload.at,
      payload: {
        nodeId: updatedNode.id,
        status: updatedNode.status,
        batteryPct: updatedNode.batteryPct,
        linkQualityPct: updatedNode.linkQualityPct,
        lastHeartbeatAt: updatedNode.lastHeartbeatAt,
      },
    });
  }

  for (const outage of [...sweepEffects.outageEvents, ...heartbeatEffects.outageEvents]) {
    streamEvents.push({ type: "outage", at: payload.at, payload: outage });
  }
  streamEvents.push(
    ...(await dispatchBlindspotAlerts(
      repos,
      [...sweepEffects.outageEvents, ...heartbeatEffects.outageEvents],
      payload.at,
    )),
  );

  return {
    heartbeatId: heartbeat.id,
    nodeId: node.id,
    status: applied.state.status,
    effects,
    outageId: heartbeatEffects.touchedOutageId ?? sweepEffects.touchedOutageId,
    streamEvents,
  };
}

export interface SweepOutcome {
  statusChanges: Array<{ nodeId: string; status: HealthState["status"] }>;
  outageIds: string[];
  expiredEventIds: string[];
  streamEvents: StreamEventDraft[];
}

/**
 * Periodic field-state sweep: re-derive node health from heartbeat silence
 * (a dark node cannot report its own outage) and expire unconfirmed events
 * whose confirmation window has passed. Runs on boot and on an interval;
 * every pass is idempotent.
 */
export async function sweepFieldState(
  repos: Repositories,
  nowIso: string,
): Promise<SweepOutcome> {
  const settings = repos.settings.get();
  const outcome: SweepOutcome = {
    statusChanges: [],
    outageIds: [],
    expiredEventIds: [],
    streamEvents: [],
  };

  for (const node of repos.nodes.list()) {
    const openOutage = repos.outages.findOpenForNode(node.id);
    const result = evaluateHealth(healthStateFrom(node, openOutage !== null), nowIso, settings);
    if (!result.effects.changed) continue;

    const applied = applyHealthEffects(repos, node.id, nowIso, result.effects, openOutage);
    const updatedNode = repos.nodes.upsert({ ...node, status: result.state.status });

    if (updatedNode.status !== node.status) {
      outcome.statusChanges.push({ nodeId: node.id, status: updatedNode.status });
      outcome.streamEvents.push({
        type: "node-status",
        at: nowIso,
        payload: {
          nodeId: updatedNode.id,
          status: updatedNode.status,
          batteryPct: updatedNode.batteryPct,
          linkQualityPct: updatedNode.linkQualityPct,
          lastHeartbeatAt: updatedNode.lastHeartbeatAt,
        },
      });
    }
    if (applied.touchedOutageId !== null && result.effects.openOutage) {
      outcome.outageIds.push(applied.touchedOutageId);
    }
    for (const outage of applied.outageEvents) {
      outcome.streamEvents.push({ type: "outage", at: nowIso, payload: outage });
    }
    outcome.streamEvents.push(
      ...(await dispatchBlindspotAlerts(repos, applied.outageEvents, nowIso)),
    );
  }

  for (const event of repos.events.listOpen()) {
    if (event.state !== "unconfirmed") continue;
    if (!evaluateExpiry(toPendingEvent(repos, event), nowIso, settings)) continue;

    const expired = repos.events.update({ ...event, state: "expired" });
    outcome.expiredEventIds.push(expired.id);
    outcome.streamEvents.push({ type: "event", at: nowIso, payload: expired });
  }

  return outcome;
}

function toPendingEvent(repos: Repositories, event: IncursionEvent): PendingEvent {
  if (
    event.state !== "unconfirmed" &&
    event.state !== "confirmed" &&
    event.state !== "responding"
  ) {
    throw new IngestError(409, "event_not_open", "The current event is not open.");
  }

  const leadSignal = repos.signals.findById(event.leadSignalId);
  if (leadSignal === null) {
    throw new IngestError(500, "event_missing_lead_signal", "Event lead signal is missing.");
  }

  return {
    eventId: event.id,
    nodeId: event.nodeId,
    openedAt: event.openedAt,
    state: event.state,
    leadSource: leadSignal.source,
    leadClassification: leadSignal.classification,
    leadConfidence: leadSignal.confidence,
  };
}

export interface DetectionIngestOutcome {
  signalId: string;
  eventId: string;
  eventState: IncursionEvent["state"];
  streamEvents: StreamEventDraft[];
}

export async function ingestDetection(
  repos: Repositories,
  payload: DetectionPayload,
): Promise<DetectionIngestOutcome> {
  const node = repos.nodes.findById(payload.nodeId);
  if (node === null) {
    throw new IngestError(404, "node_not_found", "Unknown sensor node.");
  }

  const signal: Signal = {
    id: makeId("sig"),
    nodeId: node.id,
    at: payload.at,
    source: payload.source,
    classification: payload.classification,
    confidence: payload.confidence,
    snapshotPath: payload.snapshotRef,
    eventId: null,
  };
  repos.signals.insert(signal);

  const openEvent = repos.events.findOpenByNode(node.id);
  const outcome = processSignal(
    openEvent === null ? null : toPendingEvent(repos, openEvent),
    signal,
    repos.settings.get(),
  );
  const eventDrafts: StreamEventDraft[] = [];

  if (outcome.expireEventId !== null) {
    const staleEvent = repos.events.findById(outcome.expireEventId);
    if (staleEvent !== null) {
      const expired = repos.events.update({ ...staleEvent, state: "expired" });
      eventDrafts.push({ type: "event", at: signal.at, payload: expired });
    }
  }

  if (outcome.decision.kind === "open") {
    const event: IncursionEvent = {
      id: makeId("evt"),
      nodeId: node.id,
      openedAt: signal.at,
      state: outcome.decision.state,
      confirmedAt: outcome.decision.state === "confirmed" ? signal.at : null,
      resolvedAt: null,
      speciesLabel:
        outcome.decision.state === "confirmed" ? outcome.decision.speciesLabel : null,
      leadSignalId: signal.id,
      confirmSignalId: null,
      firstDeliveryAt: null,
    };
    repos.events.insert(event);
    const attachedSignal = repos.signals.attachToEvent(signal.id, event.id) ?? {
      ...signal,
      eventId: event.id,
    };
    eventDrafts.push({ type: "event", at: signal.at, payload: event });
    const cascade =
      event.state === "confirmed"
        ? await dispatchCascadeForEvent(repos, event.id, signal.at)
        : { streamEvents: [] };
    return {
      signalId: signal.id,
      eventId: event.id,
      eventState: event.state,
      streamEvents: [
        { type: "signal", at: signal.at, payload: attachedSignal },
        ...eventDrafts,
        ...cascade.streamEvents,
      ],
    };
  }

  const event = repos.events.findById(outcome.decision.eventId);
  if (event === null) {
    throw new IngestError(500, "event_not_found", "Open event disappeared during ingest.");
  }

  const attachedSignal = repos.signals.attachToEvent(signal.id, event.id) ?? {
    ...signal,
    eventId: event.id,
  };

  if (outcome.decision.kind === "confirm") {
    const confirmed = repos.events.update({
      ...event,
      state: "confirmed",
      confirmedAt: signal.at,
      speciesLabel: outcome.decision.speciesLabel,
      confirmSignalId: signal.id,
    });
    eventDrafts.push({ type: "event", at: signal.at, payload: confirmed });
    const cascade = await dispatchCascadeForEvent(repos, confirmed.id, signal.at);
    return {
      signalId: signal.id,
      eventId: confirmed.id,
      eventState: confirmed.state,
      streamEvents: [
        { type: "signal", at: signal.at, payload: attachedSignal },
        ...eventDrafts,
        ...cascade.streamEvents,
      ],
    };
  }

  return {
    signalId: signal.id,
    eventId: event.id,
    eventState: event.state,
    streamEvents: [{ type: "signal", at: signal.at, payload: attachedSignal }],
  };
}

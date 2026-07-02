import { randomUUID } from "node:crypto";
import { z } from "zod";

import { processSignal, type PendingEvent } from "@/domain/confirmation";
import {
  applyHeartbeat,
  evaluateHealth,
  type HealthEffects,
  type HealthState,
} from "@/domain/health";
import type { IncursionEvent, Outage, Signal } from "@/domain/types";
import type { createRepositories } from "@/db/repositories";

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
): { openOutage: Outage | null; touchedOutageId: string | null } {
  let currentOpenOutage = openOutage;
  let touchedOutageId: string | null = null;

  if (effects.openOutage) {
    currentOpenOutage = repos.outages.insert({
      id: makeId("out"),
      nodeId,
      startedAt: at,
      endedAt: null,
      opsAlerted: effects.fireBlindspotAlert,
    });
    touchedOutageId = currentOpenOutage.id;
  }

  if (effects.closeOutage && currentOpenOutage !== null) {
    const closed = repos.outages.close(currentOpenOutage.id, at);
    touchedOutageId = closed?.id ?? currentOpenOutage.id;
    currentOpenOutage = null;
  }

  return { openOutage: currentOpenOutage, touchedOutageId };
}

export interface HeartbeatIngestOutcome {
  heartbeatId: string;
  nodeId: string;
  status: HealthState["status"];
  effects: HealthEffects;
  outageId: string | null;
}

export function ingestHeartbeat(
  repos: Repositories,
  payload: HeartbeatPayload,
): HeartbeatIngestOutcome {
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
  repos.nodes.upsert({
    ...node,
    status: applied.state.status,
    batteryPct: applied.state.batteryPct,
    linkQualityPct: acceptedHeartbeat ? payload.linkQualityPct : node.linkQualityPct,
    lastHeartbeatAt: applied.state.lastHeartbeatAt,
  });

  return {
    heartbeatId: heartbeat.id,
    nodeId: node.id,
    status: applied.state.status,
    effects: mergeEffects(sweep.effects, applied.effects),
    outageId: heartbeatEffects.touchedOutageId ?? sweepEffects.touchedOutageId,
  };
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
}

export function ingestDetection(
  repos: Repositories,
  payload: DetectionPayload,
): DetectionIngestOutcome {
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

  if (outcome.expireEventId !== null) {
    const staleEvent = repos.events.findById(outcome.expireEventId);
    if (staleEvent !== null) {
      repos.events.update({ ...staleEvent, state: "expired" });
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
    repos.signals.attachToEvent(signal.id, event.id);
    return {
      signalId: signal.id,
      eventId: event.id,
      eventState: event.state,
    };
  }

  const event = repos.events.findById(outcome.decision.eventId);
  if (event === null) {
    throw new IngestError(500, "event_not_found", "Open event disappeared during ingest.");
  }

  repos.signals.attachToEvent(signal.id, event.id);

  if (outcome.decision.kind === "confirm") {
    const confirmed = repos.events.update({
      ...event,
      state: "confirmed",
      confirmedAt: signal.at,
      speciesLabel: outcome.decision.speciesLabel,
      confirmSignalId: signal.id,
    });
    return {
      signalId: signal.id,
      eventId: confirmed.id,
      eventState: confirmed.state,
    };
  }

  return {
    signalId: signal.id,
    eventId: event.id,
    eventState: event.state,
  };
}

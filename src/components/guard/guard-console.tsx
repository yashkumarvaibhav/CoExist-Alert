"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";

import { HonestyChip } from "@/components/honesty-chip";
import { NodeKindIcon, NODE_KIND_LABELS } from "@/components/node-kind-icon";
import { StatusChip } from "@/components/status-chip";
import { planEscalation } from "@/domain/cascade";
import { haversineMeters } from "@/domain/geo";
import type {
  AlertChannel,
  AlertStatus,
  AlertTier,
  EventState,
  NodeKind,
  NodeStatus,
  ResponseAction,
} from "@/domain/types";
import { useAlarm } from "@/hooks/use-alarm";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useNowMs } from "@/hooks/use-now";
import { hasActiveAlarm } from "@/lib/alarm";
import {
  escalationStatus,
  isAckAfterEscalation,
  isEscalatedToTier,
} from "@/lib/escalation-view";
import { deriveResponseProgress, RESPONSE_STEPS } from "@/lib/response-steps";
import {
  formatCountdown,
  formatElapsed,
  formatIstDateTime,
  formatIstTime,
} from "@/lib/time";
import type { FieldStreamEvent, StreamEventType } from "@/stream/events";

/**
 * Guard console — S7 mobile-first response surface. Standby (shift card,
 * assigned nodes, recent responses) is taken over by a full-bleed incoming
 * alert when an event on an assigned node confirms. The stepper writes
 * through POST /api/events/:id/respond; the escalation countdown runs the
 * same pure planner as the server runtime and visibly cancels on ack.
 */

export interface GuardResponderSeed {
  id: string;
  name: string;
  phoneLabel: string;
  /** Ladder rung this persona sits on: tier 1 = first response, 2–3 = escalation. */
  tier: AlertTier;
}

/** One rung of the responder ladder, for "escalated to/up" copy. */
export interface GuardLadderRung {
  tier: AlertTier;
  name: string;
}

/** Simulated guard position — the distance fact is honest only with a label. */
export interface GuardPostSeed {
  label: string;
  lat: number;
  lng: number;
}

export interface GuardNodeSeed {
  id: string;
  name: string;
  kind: NodeKind;
  status: NodeStatus;
  lat: number;
  lng: number;
}

export interface GuardEventSeed {
  id: string;
  nodeId: string;
  state: EventState;
  speciesLabel: string | null;
  openedAt: string;
  confirmedAt: string | null;
  resolvedAt: string | null;
}

export interface GuardSignalSeed {
  id: string;
  eventId: string | null;
  at: string;
  source: string;
  classification: string;
  confidence: number;
  snapshotPath: string | null;
}

export interface GuardAlertSeed {
  id: string;
  eventId: string;
  channel: AlertChannel;
  status: AlertStatus;
  tier: AlertTier;
  queuedAt: string;
  isLive: boolean;
}

export interface GuardResponseSeed {
  id: string;
  eventId: string;
  responderId: string;
  action: ResponseAction;
  at: string;
}

const GUARD_STREAM_TYPES: readonly StreamEventType[] = [
  "event",
  "signal",
  "alert",
  "delivery",
  "response",
  "node-status",
];

const STEP_LABELS: Record<ResponseAction, string> = {
  acknowledged: "Acknowledged",
  en_route: "En route",
  on_site: "On site",
  resolved: "Resolved",
};

const STEP_ACTION_LABELS: Record<ResponseAction, string> = {
  acknowledged: "Acknowledge",
  en_route: "Mark en route",
  on_site: "Mark on site",
  resolved: "Mark resolved",
};

function prettyLabel(speciesLabel: string | null): string {
  if (speciesLabel === null) return "Large animal";
  const dashed = speciesLabel.replace(/_/g, "-");
  return dashed.charAt(0).toUpperCase() + dashed.slice(1);
}

function formatDistance(meters: number): string {
  if (meters < 1_000) return `${Math.round(meters)} m`;
  return `${(meters / 1_000).toFixed(1)} km`;
}

function ElapsedSince({ iso }: { iso: string }) {
  const nowMs = useNowMs();
  if (nowMs === null) return <span className="tnum">—</span>;
  return (
    <span className="tnum">
      {formatElapsed((nowMs - new Date(iso).getTime()) / 1_000)}
    </span>
  );
}

function CountdownRing({
  remainingS,
  totalS,
}: {
  remainingS: number;
  totalS: number;
}) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, remainingS / totalS));
  return (
    <svg
      aria-hidden="true"
      width="26"
      height="26"
      viewBox="0 0 26 26"
      className="shrink-0 -rotate-90"
    >
      <circle
        cx="13"
        cy="13"
        r={radius}
        fill="none"
        stroke="var(--line)"
        strokeWidth="3"
      />
      <circle
        cx="13"
        cy="13"
        r={radius}
        fill="none"
        stroke="var(--status-degraded)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
      />
    </svg>
  );
}

/**
 * Pre-ack escalation countdown — same pure planner and inputs as the server
 * runtime (last dispatch of the highest tier restarts the clock).
 */
function EscalationCountdown({
  event,
  alerts,
  escalationTimeoutS,
}: {
  event: GuardEventSeed;
  alerts: GuardAlertSeed[];
  escalationTimeoutS: number;
}) {
  const nowMs = useNowMs();
  if (nowMs === null) return null;

  const highestDispatchedTier = alerts.reduce<AlertTier>(
    (highest, alert) => (alert.tier > highest ? alert.tier : highest),
    1,
  );
  const lastDispatchAt = alerts
    .filter((alert) => alert.tier === highestDispatchedTier)
    .reduce(
      (latest, alert) => (alert.queuedAt > latest ? alert.queuedAt : latest),
      event.confirmedAt ?? event.openedAt,
    );

  const decision = planEscalation({
    lastDispatchAt,
    highestDispatchedTier,
    acknowledged: false,
    now: new Date(nowMs).toISOString(),
    settings: { escalationTimeoutS },
  });

  if (decision.kind === "stop") {
    return (
      <p className="text-sm text-muted">Max tier reached — awaiting response</p>
    );
  }
  if (decision.kind === "escalate") {
    return (
      <p className="text-sm font-medium text-status-degraded">
        Escalating to tier {decision.toTier}…
      </p>
    );
  }
  const remainingS = (new Date(decision.nextCheckAt).getTime() - nowMs) / 1_000;
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-status-degraded">
      <CountdownRing remainingS={remainingS} totalS={escalationTimeoutS} />
      Auto-escalates in{" "}
      <span className="tnum text-base">{formatCountdown(remainingS)}</span>
    </p>
  );
}

/** Teeth: a distinct chip that appears the moment an event climbs past tier 1. */
function EscalatedChip({ tier }: { tier: AlertTier }) {
  return (
    <span
      data-escalated-chip="true"
      className="inline-flex items-center gap-1 rounded-full border border-status-offline/40 bg-status-offline/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-status-offline"
    >
      Escalated · tier {tier}
    </span>
  );
}

function StepIcon({ state }: { state: "done" | "next" | "upcoming" }) {
  if (state === "done") {
    return (
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-status-resolved/40 text-status-resolved"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 12.5l5.5 5.5L20 6.5" />
        </svg>
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${
        state === "next" ? "border-accent" : "border-line"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          state === "next" ? "bg-accent" : "bg-line"
        }`}
      />
    </span>
  );
}

export function GuardConsole({
  responder,
  post,
  ladder,
  nodes,
  initialEvents,
  initialSignals,
  initialAlerts,
  initialResponses,
  escalationTimeoutS,
  focusEventId,
}: {
  responder: GuardResponderSeed;
  post: GuardPostSeed | null;
  ladder: GuardLadderRung[];
  nodes: GuardNodeSeed[];
  initialEvents: GuardEventSeed[];
  initialSignals: GuardSignalSeed[];
  initialAlerts: GuardAlertSeed[];
  initialResponses: GuardResponseSeed[];
  escalationTimeoutS: number;
  focusEventId: string | null;
}) {
  const assignedNodeIds = useMemo(
    () => new Set(nodes.map((node) => node.id)),
    [nodes],
  );

  const [events, setEvents] = useState<ReadonlyMap<string, GuardEventSeed>>(
    () => new Map(initialEvents.map((event) => [event.id, event])),
  );
  const [signals, setSignals] = useState<ReadonlyMap<string, GuardSignalSeed>>(
    () => new Map(initialSignals.map((signal) => [signal.id, signal])),
  );
  const [alerts, setAlerts] = useState<ReadonlyMap<string, GuardAlertSeed>>(
    () => new Map(initialAlerts.map((alert) => [alert.id, alert])),
  );
  const [responses, setResponses] = useState<
    ReadonlyMap<string, GuardResponseSeed>
  >(() => new Map(initialResponses.map((response) => [response.id, response])));
  const [nodeStatuses, setNodeStatuses] = useState<
    ReadonlyMap<string, NodeStatus>
  >(() => new Map(nodes.map((node) => [node.id, node.status])));
  const [focusedId, setFocusedId] = useState<string | null>(focusEventId);
  const [pendingAction, setPendingAction] = useState<ResponseAction | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const onStreamEvent = useCallback(
    (streamEvent: FieldStreamEvent) => {
      if (streamEvent.type === "event") {
        const e = streamEvent.payload;
        if (!assignedNodeIds.has(e.nodeId)) return;
        setEvents((current) => {
          const next = new Map(current);
          next.set(e.id, {
            id: e.id,
            nodeId: e.nodeId,
            state: e.state,
            speciesLabel: e.speciesLabel,
            openedAt: e.openedAt,
            confirmedAt: e.confirmedAt,
            resolvedAt: e.resolvedAt,
          });
          return next;
        });
        return;
      }
      if (streamEvent.type === "signal") {
        const s = streamEvent.payload;
        if (!assignedNodeIds.has(s.nodeId)) return;
        setSignals((current) => {
          const next = new Map(current);
          next.set(s.id, {
            id: s.id,
            eventId: s.eventId,
            at: s.at,
            source: s.source,
            classification: s.classification,
            confidence: s.confidence,
            snapshotPath: s.snapshotPath,
          });
          return next;
        });
        return;
      }
      if (streamEvent.type === "alert" || streamEvent.type === "delivery") {
        const a = streamEvent.payload;
        if (a.eventId === null) return;
        const eventId = a.eventId;
        setAlerts((current) => {
          const next = new Map(current);
          next.set(a.id, {
            id: a.id,
            eventId,
            channel: a.channel,
            status: a.status,
            tier: a.tier,
            queuedAt: a.queuedAt,
            isLive: a.isLive,
          });
          return next;
        });
        return;
      }
      if (streamEvent.type === "response") {
        const r = streamEvent.payload;
        setResponses((current) => {
          const next = new Map(current);
          next.set(r.id, {
            id: r.id,
            eventId: r.eventId,
            responderId: r.responderId,
            action: r.action,
            at: r.at,
          });
          return next;
        });
        return;
      }
      if (streamEvent.type === "node-status") {
        const n = streamEvent.payload;
        if (!assignedNodeIds.has(n.nodeId)) return;
        setNodeStatuses((current) => {
          const next = new Map(current);
          next.set(n.nodeId, n.status);
          return next;
        });
      }
    },
    [assignedNodeIds],
  );

  useLiveStream({ types: GUARD_STREAM_TYPES, onEvent: onStreamEvent });

  // Warning hooter sounds while any assigned-node event is confirmed
  // (unacknowledged) and stops the moment the responder acknowledges — the
  // events map is already scoped to this guard's nodes.
  const alarmActive = useMemo(
    () => hasActiveAlarm([...events.values()].map((event) => event.state)),
    [events],
  );
  useAlarm(alarmActive);

  const respond = useCallback(
    async (eventId: string, action: ResponseAction) => {
      setPendingAction(action);
      setActionError(null);
      try {
        const res = await fetch(`/api/events/${eventId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responderId: responder.id, action }),
        });
        if (!res.ok) {
          setActionError("Could not record the response — try again.");
          return;
        }
        const outcome = (await res.json()) as {
          response: GuardResponseSeed;
          event: GuardEventSeed;
        };
        // Merge directly so the stepper advances even if the SSE echo lags.
        setResponses((current) => {
          const next = new Map(current);
          next.set(outcome.response.id, outcome.response);
          return next;
        });
        setEvents((current) => {
          const next = new Map(current);
          next.set(outcome.event.id, outcome.event);
          return next;
        });
      } catch {
        setActionError("Could not record the response — try again.");
      } finally {
        setPendingAction(null);
      }
    },
    [responder.id],
  );

  const active = [...events.values()]
    .filter(
      (event) => event.state === "confirmed" || event.state === "responding",
    )
    .sort((a, b) =>
      (b.confirmedAt ?? b.openedAt).localeCompare(a.confirmedAt ?? a.openedAt),
    );
  if (focusedId !== null) {
    const index = active.findIndex((event) => event.id === focusedId);
    if (index > 0) active.unshift(...active.splice(index, 1));
  }
  const primary = active.length > 0 ? active[0] : null;
  const others = active.slice(1);

  const history = [...events.values()]
    .filter((event) => event.state === "resolved")
    .sort((a, b) =>
      (b.resolvedAt ?? b.openedAt).localeCompare(a.resolvedAt ?? a.openedAt),
    )
    .slice(0, 5);

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
      <section aria-label="Incoming alert" aria-live="assertive">
        {primary === null ? (
          <div className="rounded-lg border border-line bg-raised px-4 py-6 text-center">
            <p className="font-serif text-lg text-ink">Standing by</p>
            <p className="mt-1 text-sm text-muted">
              No active alerts on your assigned nodes.
            </p>
          </div>
        ) : (
          <IncomingAlertCard
            event={primary}
            node={nodeById.get(primary.nodeId) ?? null}
            post={post}
            responder={responder}
            ladder={ladder}
            signals={[...signals.values()].filter(
              (signal) => signal.eventId === primary.id,
            )}
            alerts={[...alerts.values()].filter(
              (alert) => alert.eventId === primary.id,
            )}
            responses={[...responses.values()]
              .filter((response) => response.eventId === primary.id)
              .sort((a, b) => a.at.localeCompare(b.at))}
            escalationTimeoutS={escalationTimeoutS}
            pendingAction={pendingAction}
            actionError={actionError}
            onRespond={respond}
          />
        )}
      </section>

      {others.length > 0 && (
        <section
          aria-label="More active alerts"
          className="rounded-lg border border-line bg-raised"
        >
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-medium">
            More active alerts
          </h2>
          <ul className="divide-y divide-line">
            {others.map((event) => {
              const escalated = escalationStatus(
                [...alerts.values()].filter((alert) => alert.eventId === event.id),
              );
              return (
                <li
                  key={event.id}
                  data-active-event-id={event.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-body">
                    {prettyLabel(event.speciesLabel)} —{" "}
                    {nodeById.get(event.nodeId)?.name ?? event.nodeId}
                  </span>
                  {escalated.escalated && <EscalatedChip tier={escalated.tier} />}
                  <button
                    type="button"
                    onClick={() => setFocusedId(event.id)}
                    className="min-h-11 shrink-0 rounded-md border border-line px-3 text-sm font-medium text-accent hover:bg-hover"
                  >
                    View
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
      <section
        aria-labelledby="shift-heading"
        className="rounded-lg border border-line bg-raised"
      >
        <h2
          id="shift-heading"
          className="border-b border-line px-4 py-2.5 text-sm font-medium"
        >
          Shift
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.08em] text-faint">
              Responder
            </dt>
            <dd className="mt-0.5 font-medium text-ink">{responder.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.08em] text-faint">
              Contact
            </dt>
            <dd className="mt-0.5 text-body">{responder.phoneLabel}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs uppercase tracking-[0.08em] text-faint">
              {post !== null ? "Position" : "Role"}
            </dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-body">
              {post !== null ? (
                <>
                  {post.label} <HonestyChip mode="simulated" />
                </>
              ) : (
                `Tier ${responder.tier} · escalation responder`
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="assigned-heading"
        className="rounded-lg border border-line bg-raised"
      >
        <h2
          id="assigned-heading"
          className="border-b border-line px-4 py-2.5 text-sm font-medium"
        >
          Assigned nodes
        </h2>
        <ul className="divide-y divide-line">
          {nodes.map((node) => (
            <li
              key={node.id}
              className="flex items-center gap-3 px-4 py-3"
              data-node-id={node.id}
            >
              <NodeKindIcon
                kind={node.kind}
                className="size-5 shrink-0 text-muted"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {node.name}
                </span>
                <span className="block text-xs text-faint">
                  {NODE_KIND_LABELS[node.kind]}
                  {post !== null && (
                    <>
                      {" · "}
                      {formatDistance(
                        haversineMeters(post.lat, post.lng, node.lat, node.lng),
                      )}{" "}
                      away
                    </>
                  )}
                </span>
              </span>
              <StatusChip
                status={nodeStatuses.get(node.id) ?? node.status}
              />
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="history-heading"
        className="rounded-lg border border-line bg-raised"
      >
        <h2
          id="history-heading"
          className="border-b border-line px-4 py-2.5 text-sm font-medium"
        >
          Recent responses
        </h2>
        {history.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            No resolved events yet on your nodes.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((event) => {
              const progress = deriveResponseProgress(
                [...responses.values()].filter(
                  (response) => response.eventId === event.id,
                ),
              );
              const ackAt = progress.completedAt.acknowledged;
              const baseline = event.confirmedAt;
              return (
                <li
                  key={event.id}
                  data-history-event-id={event.id}
                  className="px-4 py-3"
                >
                  <p className="text-sm font-medium text-ink">
                    {prettyLabel(event.speciesLabel)} —{" "}
                    {nodeById.get(event.nodeId)?.name ?? event.nodeId}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {event.resolvedAt !== null &&
                      `Resolved ${formatIstDateTime(event.resolvedAt)} IST`}
                    {baseline !== null && ackAt !== undefined && (
                      <span className="tnum">
                        {" "}
                        · Ack +
                        {formatElapsed(
                          (new Date(ackAt).getTime() -
                            new Date(baseline).getTime()) /
                            1_000,
                        )}
                      </span>
                    )}
                    {baseline !== null && event.resolvedAt !== null && (
                      <span className="tnum">
                        {" "}
                        · Resolved +
                        {formatElapsed(
                          (new Date(event.resolvedAt).getTime() -
                            new Date(baseline).getTime()) /
                            1_000,
                        )}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}

function IncomingAlertCard({
  event,
  node,
  post,
  responder,
  ladder,
  signals,
  alerts,
  responses,
  escalationTimeoutS,
  pendingAction,
  actionError,
  onRespond,
}: {
  event: GuardEventSeed;
  node: GuardNodeSeed | null;
  post: GuardPostSeed | null;
  responder: GuardResponderSeed;
  ladder: GuardLadderRung[];
  signals: GuardSignalSeed[];
  alerts: GuardAlertSeed[];
  responses: GuardResponseSeed[];
  escalationTimeoutS: number;
  pendingAction: ResponseAction | null;
  actionError: string | null;
  onRespond: (eventId: string, action: ResponseAction) => void;
}) {
  const progress = deriveResponseProgress(responses);
  const acknowledged = progress.completedAt.acknowledged !== undefined;

  const escalation = escalationStatus(alerts);
  const escalatedToMe = isEscalatedToTier(alerts, responder.tier);
  const lateAck = isAckAfterEscalation(responses, alerts);
  const rungName = (tier: number) =>
    ladder.find((rung) => rung.tier === tier)?.name ?? `tier ${tier}`;

  const snapshot = [...signals]
    .sort((a, b) => b.at.localeCompare(a.at))
    .find((signal) => signal.snapshotPath !== null);
  const confidence = signals.reduce<GuardSignalSeed | null>(
    (best, signal) =>
      best === null || signal.confidence > best.confidence ? signal : best,
    null,
  );
  const webexAlert = alerts.find((alert) => alert.channel === "guard_webex");
  const confirmedAt = event.confirmedAt ?? event.openedAt;

  return (
    <article
      data-incoming-event-id={event.id}
      data-escalated={escalation.escalated ? "true" : "false"}
      className={`overflow-hidden rounded-lg border bg-raised ${
        escalation.escalated
          ? "border-status-offline/50"
          : "border-status-confirmed/40"
      }`}
    >
      {escalatedToMe && !acknowledged && (
        <div
          role="alert"
          data-escalated-to-me="true"
          className="flex flex-col gap-0.5 border-b border-status-offline/40 bg-status-offline/10 px-4 py-2.5"
        >
          <p className="text-sm font-semibold text-status-offline">
            Escalated to you
          </p>
          <p className="text-xs text-body">
            {rungName(responder.tier - 1)} did not respond in time —
            responsibility is now yours.
          </p>
        </div>
      )}

      {snapshot?.snapshotPath != null && (
        <Image
          src={snapshot.snapshotPath}
          alt={`Detection snapshot from ${node?.name ?? event.nodeId}`}
          width={640}
          height={360}
          unoptimized
          priority
          className="aspect-video w-full border-b border-line bg-white object-cover"
        />
      )}

      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={event.state} />
          {escalation.escalated && <EscalatedChip tier={escalation.tier} />}
          {webexAlert !== undefined && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              Also via Webex{" "}
              <HonestyChip mode={webexAlert.isLive ? "live" : "simulated"} />
            </span>
          )}
        </div>

        <h2 className="font-serif text-2xl leading-tight text-ink">
          {prettyLabel(event.speciesLabel)} confirmed
          {node !== null && (
            <span className="block text-lg text-body">{node.name}</span>
          )}
        </h2>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.08em] text-faint">
              Confirmed
            </dt>
            <dd className="tnum mt-0.5 text-body">
              {formatIstTime(confirmedAt)} IST ·{" "}
              <ElapsedSince iso={confirmedAt} /> ago
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.08em] text-faint">
              Confidence
            </dt>
            <dd className="tnum mt-0.5 text-body">
              {confidence !== null
                ? `${Math.round(confidence.confidence * 100)}% · ${confidence.source}`
                : "—"}
            </dd>
          </div>
          {node !== null && post !== null && (
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-[0.08em] text-faint">
                Distance
              </dt>
              <dd className="mt-0.5 text-body">
                <span className="tnum">
                  {formatDistance(
                    haversineMeters(post.lat, post.lng, node.lat, node.lng),
                  )}
                </span>{" "}
                from {post.label}
              </dd>
            </div>
          )}
        </dl>

        {acknowledged ? (
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-status-resolved">
              Escalation cancelled — acknowledged{" "}
              <span className="tnum">
                {formatIstTime(progress.completedAt.acknowledged as string)}
              </span>{" "}
              IST
            </p>
            {lateAck && (
              <p className="text-xs font-medium text-status-offline">
                Acknowledged after escalation to tier {escalation.tier} (
                {rungName(escalation.tier)}).
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <EscalationCountdown
              event={event}
              alerts={alerts}
              escalationTimeoutS={escalationTimeoutS}
            />
            {escalation.escalated && responder.tier < escalation.tier && (
              <p className="text-xs font-medium text-status-offline">
                Escalated up to {rungName(escalation.tier)} — no acknowledgement
                at your tier in time.
              </p>
            )}
          </div>
        )}

        <ol className="flex flex-col gap-2" aria-label="Response steps">
          {RESPONSE_STEPS.map((step) => {
            const at = progress.completedAt[step];
            const isNext = progress.nextAction === step;
            return (
              <li key={step} className="flex min-h-11 items-center gap-3">
                <StepIcon
                  state={at !== undefined ? "done" : isNext ? "next" : "upcoming"}
                />
                {isNext ? (
                  <button
                    type="button"
                    onClick={() => onRespond(event.id, step)}
                    disabled={pendingAction !== null}
                    className="h-14 flex-1 rounded-md bg-accent text-base font-medium text-accent-contrast hover:bg-accent-hover disabled:opacity-60"
                  >
                    {pendingAction === step ? "Recording…" : STEP_ACTION_LABELS[step]}
                  </button>
                ) : (
                  <span
                    className={`flex flex-1 items-baseline justify-between gap-2 text-sm ${
                      at !== undefined ? "text-body" : "text-faint"
                    }`}
                  >
                    {STEP_LABELS[step]}
                    {at !== undefined && (
                      <span className="tnum text-xs text-muted">
                        {formatIstTime(at)} IST
                      </span>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {actionError !== null && (
          <p role="alert" className="text-sm font-medium text-status-offline">
            {actionError}
          </p>
        )}
      </div>
    </article>
  );
}

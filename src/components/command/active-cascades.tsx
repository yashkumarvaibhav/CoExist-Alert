"use client";

import { useCallback, useState } from "react";

import { StatusChip } from "@/components/status-chip";
import { planEscalation } from "@/domain/cascade";
import type {
  AlertChannel,
  AlertStatus,
  AlertTier,
  EventState,
  ResponseAction,
} from "@/domain/types";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useNowMs } from "@/hooks/use-now";
import { formatCountdown, formatElapsed } from "@/lib/time";
import type { FieldStreamEvent, StreamEventType } from "@/stream/events";

/**
 * Active Cascades — one card per confirmed-unresolved event: channel dots
 * colored by delivery status, tier indicator, escalation countdown (computed
 * client-side from the same pure planner the server runtime uses), and the
 * first-acknowledgement status.
 */

export interface CascadeEventSeed {
  id: string;
  nodeId: string;
  state: EventState;
  speciesLabel: string | null;
  openedAt: string;
  confirmedAt: string | null;
}

export interface CascadeAlertSeed {
  id: string;
  eventId: string;
  tier: AlertTier;
  channel: AlertChannel;
  status: AlertStatus;
  queuedAt: string;
  isLive: boolean;
}

export interface CascadeResponseSeed {
  id: string;
  eventId: string;
  responderId: string;
  action: ResponseAction;
  at: string;
}

const CASCADE_EVENT_TYPES: readonly StreamEventType[] = [
  "event",
  "alert",
  "delivery",
  "response",
];

const CHANNEL_LABELS: Record<AlertChannel, string> = {
  siren: "Siren",
  villager_phone: "Villagers",
  guard_webex: "Webex",
  control_room: "Control",
  blindspot_ops: "Ops",
};

function dotClass(status: AlertStatus): string {
  if (status === "delivered" || status === "acked") return "bg-status-resolved";
  if (status === "failed") return "bg-status-offline";
  return "bg-status-degraded";
}

function prettyLabel(speciesLabel: string | null): string {
  if (speciesLabel === null) return "Large animal";
  const dashed = speciesLabel.replace(/_/g, "-");
  return dashed.charAt(0).toUpperCase() + dashed.slice(1);
}

function CountdownRing({
  remainingS,
  totalS,
}: {
  remainingS: number;
  totalS: number;
}) {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, remainingS / totalS));
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      className="shrink-0 -rotate-90"
    >
      <circle
        cx="11"
        cy="11"
        r={radius}
        fill="none"
        stroke="var(--line)"
        strokeWidth="2.5"
      />
      <circle
        cx="11"
        cy="11"
        r={radius}
        fill="none"
        stroke="var(--status-degraded)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
      />
    </svg>
  );
}

function EscalationLine({
  event,
  alerts,
  acknowledged,
  escalationTimeoutS,
}: {
  event: CascadeEventSeed;
  alerts: CascadeAlertSeed[];
  acknowledged: boolean;
  escalationTimeoutS: number;
}) {
  const nowMs = useNowMs();
  if (nowMs === null || acknowledged) return null;

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
    acknowledged,
    now: new Date(nowMs).toISOString(),
    settings: { escalationTimeoutS },
  });

  if (decision.kind === "stop") {
    return (
      <p className="text-xs text-muted">
        Max tier reached — awaiting response
      </p>
    );
  }
  if (decision.kind === "escalate") {
    return (
      <p className="text-xs font-medium text-status-degraded">
        Escalating to tier {decision.toTier}…
      </p>
    );
  }
  const remainingS =
    (new Date(decision.nextCheckAt).getTime() - nowMs) / 1_000;
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-status-degraded">
      <CountdownRing remainingS={remainingS} totalS={escalationTimeoutS} />
      Auto-escalates in{" "}
      <span className="tnum">{formatCountdown(remainingS)}</span>
    </p>
  );
}

export function ActiveCascades({
  initialEvents,
  initialAlerts,
  initialResponses,
  nodeNames,
  responderNames,
  escalationTimeoutS,
}: {
  initialEvents: CascadeEventSeed[];
  initialAlerts: CascadeAlertSeed[];
  initialResponses: CascadeResponseSeed[];
  nodeNames: Record<string, string>;
  responderNames: Record<string, string>;
  escalationTimeoutS: number;
}) {
  const [events, setEvents] = useState<ReadonlyMap<string, CascadeEventSeed>>(
    () => new Map(initialEvents.map((event) => [event.id, event])),
  );
  const [alerts, setAlerts] = useState<ReadonlyMap<string, CascadeAlertSeed>>(
    () => new Map(initialAlerts.map((alert) => [alert.id, alert])),
  );
  const [responses, setResponses] = useState<
    ReadonlyMap<string, CascadeResponseSeed>
  >(() => new Map(initialResponses.map((response) => [response.id, response])));

  const onStreamEvent = useCallback((streamEvent: FieldStreamEvent) => {
    if (streamEvent.type === "event") {
      const e = streamEvent.payload;
      setEvents((current) => {
        const next = new Map(current);
        next.set(e.id, {
          id: e.id,
          nodeId: e.nodeId,
          state: e.state,
          speciesLabel: e.speciesLabel,
          openedAt: e.openedAt,
          confirmedAt: e.confirmedAt,
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
          tier: a.tier,
          channel: a.channel,
          status: a.status,
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
    }
  }, []);

  useLiveStream({ types: CASCADE_EVENT_TYPES, onEvent: onStreamEvent });

  const active = [...events.values()]
    .filter((event) => event.state === "confirmed" || event.state === "responding")
    .sort((a, b) =>
      (b.confirmedAt ?? b.openedAt).localeCompare(a.confirmedAt ?? a.openedAt),
    );

  return (
    <section
      aria-labelledby="cascades-heading"
      className="rounded-lg border border-line bg-raised"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="cascades-heading" className="text-base font-medium">
          Active cascades
        </h2>
        <span className="text-xs text-faint">
          Channels SIMULATED · Webex LIVE when configured
        </span>
      </div>

      {active.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">
          No active cascades — the boundary is quiet.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {active.map((event) => {
            const eventAlerts = [...alerts.values()]
              .filter((alert) => alert.eventId === event.id)
              .sort(
                (a, b) =>
                  a.tier - b.tier || a.queuedAt.localeCompare(b.queuedAt),
              );
            const eventResponses = [...responses.values()]
              .filter((response) => response.eventId === event.id)
              .sort((a, b) => a.at.localeCompare(b.at));
            const ack = eventResponses.find(
              (response) => response.action === "acknowledged",
            );
            const highestTier = eventAlerts.reduce<AlertTier>(
              (highest, alert) => (alert.tier > highest ? alert.tier : highest),
              1,
            );
            const acknowledged =
              ack !== undefined || event.state === "responding";

            return (
              <li
                key={event.id}
                data-cascade-event-id={event.id}
                className="flex flex-col gap-2 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="font-serif text-base font-medium text-ink">
                    {prettyLabel(event.speciesLabel)} —{" "}
                    {nodeNames[event.nodeId] ?? event.nodeId}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="rounded-sm border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                      Tier {highestTier}
                    </span>
                    <StatusChip status={event.state} />
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {eventAlerts.map((alert) => (
                    <span
                      key={alert.id}
                      title={`${CHANNEL_LABELS[alert.channel]} — ${alert.status}${
                        alert.isLive ? " · LIVE" : " · SIMULATED"
                      }`}
                      className="flex items-center gap-1.5"
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2.5 rounded-full ${dotClass(alert.status)}`}
                      />
                      <span className="text-[10px] uppercase tracking-[0.08em] text-faint">
                        {CHANNEL_LABELS[alert.channel]}
                      </span>
                      <span className="sr-only">
                        : {alert.status},{" "}
                        {alert.isLive ? "live" : "simulated"}
                      </span>
                    </span>
                  ))}
                  {eventAlerts.length === 0 && (
                    <span className="text-xs text-faint">dispatching…</span>
                  )}
                </div>

                {ack !== undefined ? (
                  <p className="text-xs font-medium text-status-resolved">
                    Acknowledged by{" "}
                    {responderNames[ack.responderId] ?? ack.responderId}
                    {event.confirmedAt !== null && (
                      <span className="tnum font-normal text-muted">
                        {" "}
                        · +
                        {formatElapsed(
                          (new Date(ack.at).getTime() -
                            new Date(event.confirmedAt).getTime()) /
                            1_000,
                        )}{" "}
                        after confirmation
                      </span>
                    )}
                  </p>
                ) : (
                  <EscalationLine
                    event={event}
                    alerts={eventAlerts}
                    acknowledged={acknowledged}
                    escalationTimeoutS={escalationTimeoutS}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

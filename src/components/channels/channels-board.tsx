"use client";

import { useCallback, useMemo, useState } from "react";

import { HonestyChip } from "@/components/honesty-chip";
import type {
  AlertStatus,
  EventState,
  ResponseAction,
} from "@/domain/types";
import { useAlarm } from "@/hooks/use-alarm";
import { useLiveStream } from "@/hooks/use-live-stream";
import { hasActiveAlarm } from "@/lib/alarm";
import { formatIstTime } from "@/lib/time";
import type { FieldStreamEvent, StreamEventType } from "@/stream/events";

/**
 * Channels board — S8 demo-facing proof of targeting. Villager phone frames
 * per hamlet (only in-geofence hamlets receive cards; the distant one visibly
 * does not) and a terminal-style rail-control advisory strip whose
 * Acknowledge writes through the same response API as every other responder.
 */

export interface ChannelZoneSeed {
  id: string;
  label: string;
  /** Names of nodes whose geofence covers this hamlet (planner's rule). */
  coveredByNames: string[];
}

export interface ChannelAlertSeed {
  id: string;
  eventId: string;
  channel: "villager_phone" | "control_room";
  targetRef: string;
  status: AlertStatus;
  queuedAt: string;
  isLive: boolean;
}

export interface ChannelEventSeed {
  id: string;
  nodeId: string;
  state: EventState;
  speciesLabel: string | null;
  openedAt: string;
  confirmedAt: string | null;
}

export interface ChannelResponseSeed {
  id: string;
  eventId: string;
  responderId: string;
  action: ResponseAction;
  at: string;
}

const CHANNEL_STREAM_TYPES: readonly StreamEventType[] = [
  "alert",
  "delivery",
  "event",
  "response",
];

const CARDS_PER_PHONE = 3;
const ADVISORY_ROWS = 8;

function prettyLabel(speciesLabel: string | null): string {
  if (speciesLabel === null) return "Large animal";
  const dashed = speciesLabel.replace(/_/g, "-");
  return dashed.charAt(0).toUpperCase() + dashed.slice(1);
}

function deliveryLabel(status: AlertStatus): string {
  if (status === "delivered" || status === "acked") return "delivered";
  if (status === "failed") return "failed";
  return "sending…";
}

export function ChannelsBoard({
  zones,
  initialAlerts,
  initialEvents,
  initialResponses,
  nodeNames,
  responderNames,
  controlResponderId,
}: {
  zones: ChannelZoneSeed[];
  initialAlerts: ChannelAlertSeed[];
  initialEvents: ChannelEventSeed[];
  initialResponses: ChannelResponseSeed[];
  nodeNames: Record<string, string>;
  responderNames: Record<string, string>;
  controlResponderId: string;
}) {
  const [alerts, setAlerts] = useState<ReadonlyMap<string, ChannelAlertSeed>>(
    () => new Map(initialAlerts.map((alert) => [alert.id, alert])),
  );
  const [events, setEvents] = useState<ReadonlyMap<string, ChannelEventSeed>>(
    () => new Map(initialEvents.map((event) => [event.id, event])),
  );
  const [responses, setResponses] = useState<
    ReadonlyMap<string, ChannelResponseSeed>
  >(() => new Map(initialResponses.map((response) => [response.id, response])));
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);

  const onStreamEvent = useCallback((streamEvent: FieldStreamEvent) => {
    if (streamEvent.type === "alert" || streamEvent.type === "delivery") {
      const a = streamEvent.payload;
      if (
        a.eventId === null ||
        (a.channel !== "villager_phone" && a.channel !== "control_room")
      ) {
        return;
      }
      const eventId = a.eventId;
      const channel = a.channel;
      setAlerts((current) => {
        const next = new Map(current);
        next.set(a.id, {
          id: a.id,
          eventId,
          channel,
          targetRef: a.targetRef,
          status: a.status,
          queuedAt: a.queuedAt,
          isLive: a.isLive,
        });
        return next;
      });
      return;
    }
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

  useLiveStream({ types: CHANNEL_STREAM_TYPES, onEvent: onStreamEvent });

  // Warning hooter sounds while any event surfaced on this board is confirmed
  // (unacknowledged) and stops when rail control acknowledges it.
  const alarmActive = useMemo(
    () => hasActiveAlarm([...events.values()].map((event) => event.state)),
    [events],
  );
  useAlarm(alarmActive);

  const acknowledge = useCallback(
    async (alertId: string, eventId: string) => {
      setPendingAlertId(alertId);
      setAckError(null);
      try {
        const res = await fetch(`/api/events/${eventId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            responderId: controlResponderId,
            action: "acknowledged",
          }),
        });
        if (!res.ok) {
          setAckError("Could not record the acknowledgement — try again.");
          return;
        }
        const outcome = (await res.json()) as {
          response: ChannelResponseSeed;
          event: ChannelEventSeed;
        };
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
        setAckError("Could not record the acknowledgement — try again.");
      } finally {
        setPendingAlertId(null);
      }
    },
    [controlResponderId],
  );

  const advisories = [...alerts.values()]
    .filter((alert) => alert.channel === "control_room")
    .sort((a, b) => b.queuedAt.localeCompare(a.queuedAt))
    .slice(0, ADVISORY_ROWS);

  return (
    <div className="flex flex-col gap-8">
      <section
        aria-labelledby="villager-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="villager-heading" className="text-xl">
            Villager phone feed
          </h2>
          <HonestyChip mode="simulated" />
        </div>
        <p className="text-sm text-muted">
          Only hamlets inside a sensor&apos;s geofence are alerted. Production
          channel: cell broadcast / IVR to registered numbers, plus the local
          siren on a GPIO relay.
        </p>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {zones.map((zone) => {
            const covered = zone.coveredByNames.length > 0;
            const cards = covered
              ? [...alerts.values()]
                  .filter(
                    (alert) =>
                      alert.channel === "villager_phone" &&
                      alert.targetRef === zone.id,
                  )
                  .sort((a, b) => b.queuedAt.localeCompare(a.queuedAt))
                  .slice(0, CARDS_PER_PHONE)
              : [];
            return (
              <li key={zone.id} data-zone-id={zone.id} className="min-w-0">
                <div className="rounded-[28px] border border-line bg-raised p-2 shadow-sm">
                  <div className="flex min-h-72 flex-col gap-2.5 rounded-[20px] bg-sidebar px-3 pb-4 pt-2">
                    <span
                      aria-hidden="true"
                      className="mx-auto h-1.5 w-14 rounded-full bg-line"
                    />
                    <p className="text-sm font-medium text-ink">{zone.label}</p>
                    {covered ? (
                      <p className="text-xs text-faint">
                        In geofence of {zone.coveredByNames.join(", ")}
                      </p>
                    ) : (
                      <p className="text-xs font-medium text-muted">
                        Outside geofence — not alerted
                      </p>
                    )}

                    {cards.length === 0 ? (
                      <p className="my-auto text-center text-xs text-faint">
                        {covered
                          ? "No recent alerts."
                          : "This hamlet is too far from every sensor — the cascade never targets it."}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {cards.map((alert) => {
                          const event = events.get(alert.eventId);
                          const nodeName =
                            event !== undefined
                              ? (nodeNames[event.nodeId] ?? event.nodeId)
                              : "sensor node";
                          return (
                            <li
                              key={alert.id}
                              className="rounded-md border border-status-confirmed/40 bg-raised p-2.5"
                            >
                              <p className="flex items-center gap-1.5 text-sm font-medium text-status-confirmed">
                                <svg
                                  aria-hidden="true"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="shrink-0"
                                >
                                  <circle cx="12" cy="12" r="9" />
                                  <path d="M12 7.5v5.5M12 16.5v.1" />
                                </svg>
                                {prettyLabel(event?.speciesLabel ?? null)} alert
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-body">
                                Reported near {nodeName}. Stay indoors and keep
                                children and cattle away from the boundary.
                              </p>
                              <p className="tnum mt-1.5 flex items-center justify-between gap-2 text-[11px] text-faint">
                                {formatIstTime(alert.queuedAt)} IST
                                <span>{deliveryLabel(alert.status)}</span>
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="rail-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="rail-heading" className="text-xl">
            Rail control strip
          </h2>
          <HonestyChip mode="simulated" />
          <span className="text-xs text-faint">
            {responderNames[controlResponderId] ?? controlResponderId}
          </span>
        </div>
        <p className="text-sm text-muted">
          Slow/stop advisories for crossings with a confirmed incursion.
          Production channel: section signalling and TMS integration —
          advisory to loco pilots via section control.
        </p>

        <div className="overflow-hidden rounded-lg border border-line bg-code">
          {advisories.length === 0 ? (
            <p className="px-4 py-8 text-center font-mono text-sm text-muted">
              No advisories — all crossings clear.
            </p>
          ) : (
            <ul className="divide-y divide-line font-mono text-sm">
              {advisories.map((alert) => {
                const event = events.get(alert.eventId);
                const nodeName =
                  event !== undefined
                    ? (nodeNames[event.nodeId] ?? event.nodeId)
                    : "crossing";
                const ack = [...responses.values()]
                  .filter(
                    (response) =>
                      response.eventId === alert.eventId &&
                      response.action === "acknowledged",
                  )
                  .sort((a, b) => a.at.localeCompare(b.at))[0];
                const open =
                  event !== undefined &&
                  (event.state === "confirmed" || event.state === "responding");
                return (
                  <li
                    key={alert.id}
                    data-advisory-alert-id={alert.id}
                    data-advisory-event-id={alert.eventId}
                    className="flex flex-col gap-2 px-4 py-3"
                  >
                    <p className="text-body">
                      <span className="tnum text-faint">
                        {formatIstTime(alert.queuedAt)} IST
                      </span>{" "}
                      <span className="font-medium text-status-confirmed">
                        SLOW/STOP
                      </span>{" "}
                      — {nodeName} —{" "}
                      {prettyLabel(event?.speciesLabel ?? null).toLowerCase()}{" "}
                      confirmed
                    </p>
                    {ack !== undefined ? (
                      <p className="text-xs text-status-resolved">
                        ACK <span className="tnum">{formatIstTime(ack.at)}</span>{" "}
                        IST — {responderNames[ack.responderId] ?? ack.responderId}
                      </p>
                    ) : open ? (
                      <button
                        type="button"
                        onClick={() => acknowledge(alert.id, alert.eventId)}
                        disabled={pendingAlertId !== null}
                        className="min-h-11 self-start rounded-md bg-accent px-5 font-sans text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:opacity-60"
                      >
                        {pendingAlertId === alert.id
                          ? "Recording…"
                          : "Acknowledge advisory"}
                      </button>
                    ) : (
                      <p className="text-xs uppercase tracking-[0.08em] text-faint">
                        closed — {event?.state ?? "archived"}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {ackError !== null && (
          <p role="alert" className="text-sm font-medium text-status-offline">
            {ackError}
          </p>
        )}
      </section>
    </div>
  );
}

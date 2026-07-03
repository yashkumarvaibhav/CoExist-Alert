import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { HonestyChip } from "@/components/honesty-chip";
import { StatusChip } from "@/components/status-chip";
import { getRuntimeRepositories } from "@/db/runtime";
import type {
  Alert,
  AlertChannel,
  AlertStatus,
  EventResponse,
  IncursionEvent,
  Responder,
  ResponseAction,
  SensorNode,
  Signal,
  SignalSource,
  VillagerZone,
} from "@/domain/types";
import { formatElapsed, formatIstDateTime, formatIstTime } from "@/lib/time";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = getRuntimeRepositories().events.findById(id);
  if (event === null) notFound();
  return {
    title: `Event ${event.id} — CoExist Alert`,
  };
}

const CHANNEL_LABELS: Record<AlertChannel, string> = {
  siren: "Siren",
  villager_phone: "Villagers",
  guard_webex: "Webex",
  control_room: "Control",
  blindspot_ops: "Ops",
};

const SOURCE_LABELS: Record<SignalSource, string> = {
  camera: "camera",
  thermal: "thermal",
  acoustic: "acoustic",
  motion: "motion",
};

const ACTION_LABELS: Record<ResponseAction, string> = {
  acknowledged: "ACKNOWLEDGED",
  en_route: "EN ROUTE",
  on_site: "ON SITE",
  resolved: "RESOLVED",
};

function secondsBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1_000;
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

function speciesLabel(event: IncursionEvent): string {
  return event.speciesLabel?.replace(/_/g, "-") ?? "large-animal";
}

function titleCase(value: string): string {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function confidenceLabel(confidence: number): string {
  return confidence.toFixed(2);
}

function deltaLabel(event: IncursionEvent, at: string): string {
  return `+${formatElapsed(secondsBetween(event.openedAt, at))}`;
}

function alertStatusClass(status: AlertStatus): string {
  if (status === "delivered" || status === "acked") {
    return "border-status-resolved/40 text-status-resolved";
  }
  if (status === "failed") return "border-status-offline/40 text-status-offline";
  return "border-status-degraded/40 text-status-degraded";
}

function AlertStatusChip({ status }: { status: AlertStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${alertStatusClass(status)}`}
    >
      {status}
    </span>
  );
}

function safeSnapshotPath(path: string | null): string | null {
  if (path === null) return null;
  return path.startsWith("/demo-snapshots/") ? path : null;
}

function targetLabel(
  alert: Alert,
  nodes: ReadonlyMap<string, SensorNode>,
  responders: ReadonlyMap<string, Responder>,
  zones: ReadonlyMap<string, VillagerZone>,
): string {
  if (alert.channel === "siren") {
    return nodes.get(alert.targetRef)?.name ?? alert.targetRef;
  }
  if (alert.channel === "villager_phone") {
    return zones.get(alert.targetRef)?.label ?? alert.targetRef;
  }
  if (alert.channel === "guard_webex" || alert.channel === "control_room") {
    return responders.get(alert.targetRef)?.name ?? alert.targetRef;
  }
  return alert.targetRef;
}

function firstResponse(
  responses: EventResponse[],
  action: ResponseAction,
): EventResponse | undefined {
  return responses.find((response) => response.action === action);
}

function TimelineSnapshot({ signal }: { signal: Signal }) {
  const snapshot = safeSnapshotPath(signal.snapshotPath);
  if (snapshot === null) return null;
  return (
    <span
      role="img"
      aria-label={`SIMULATED snapshot for ${signal.classification.replace(/_/g, "-")}`}
      className="mt-2 block h-14 w-20 rounded-sm border border-line bg-cover bg-center"
      style={{ backgroundImage: `url(${snapshot})` }}
    />
  );
}

interface TimelineItem {
  id: string;
  at: string;
  order: number;
  label: string;
  body: ReactNode;
  tone?: "danger" | "warning" | "success" | "info";
}

function toneClass(tone: TimelineItem["tone"]): string {
  if (tone === "danger") return "border-status-confirmed text-status-confirmed";
  if (tone === "warning") return "border-status-unconfirmed text-status-unconfirmed";
  if (tone === "success") return "border-status-resolved text-status-resolved";
  return "border-line text-muted";
}

function buildTimeline({
  event,
  node,
  signals,
  alerts,
  responses,
  responders,
  zones,
  nodes,
  confirmationWindowS,
}: {
  event: IncursionEvent;
  node: SensorNode;
  signals: Signal[];
  alerts: Alert[];
  responses: EventResponse[];
  responders: ReadonlyMap<string, Responder>;
  zones: ReadonlyMap<string, VillagerZone>;
  nodes: ReadonlyMap<string, SensorNode>;
  confirmationWindowS: number;
}): TimelineItem[] {
  const items: TimelineItem[] = [];

  signals.forEach((signal, index) => {
    const isConfirm = signal.id === event.confirmSignalId;
    items.push({
      id: `signal-${signal.id}`,
      at: signal.at,
      order: index,
      label: "Signal",
      tone: isConfirm ? "success" : "info",
      body: (
        <div>
          <p className="font-medium text-ink">
            {SOURCE_LABELS[signal.source]} {confidenceLabel(signal.confidence)}{" "}
            <span aria-hidden="true">&quot;</span>
            {signal.classification}
            <span aria-hidden="true">&quot;</span>
          </p>
          <p className="text-xs text-muted">
            {isConfirm ? "cross-source corroboration" : "edge detection payload"} ·{" "}
            SIMULATED
          </p>
          <TimelineSnapshot signal={signal} />
        </div>
      ),
    });
  });

  if (event.confirmedAt !== null) {
    items.push({
      id: "confirmed",
      at: event.confirmedAt,
      order: 20,
      label: "CONFIRMED",
      tone: "danger",
      body: (
        <p className="font-medium text-ink">
          {speciesLabel(event)} · {node.name}
        </p>
      ),
    });
  }

  if (event.state === "expired") {
    items.push({
      id: "suppressed",
      at: addSeconds(event.openedAt, confirmationWindowS),
      order: 30,
      label: "SUPPRESSED",
      tone: "warning",
      body: (
        <p className="font-medium text-ink">
          Single low-confidence signal — no alert sent.
        </p>
      ),
    });
  }

  alerts.forEach((alert, index) => {
    const at = alert.deliveredAt ?? alert.sentAt ?? alert.queuedAt;
    items.push({
      id: `alert-${alert.id}`,
      at,
      order: 40 + index,
      label: CHANNEL_LABELS[alert.channel],
      tone: alert.status === "failed" ? "danger" : "success",
      body: (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-ink">
            {targetLabel(alert, nodes, responders, zones)}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <HonestyChip mode={alert.isLive ? "live" : "simulated"} />
            <AlertStatusChip status={alert.status} />
            <span>Tier {alert.tier}</span>
          </p>
          {alert.failedReason !== null && (
            <p className="text-xs font-medium text-status-offline">
              Failure reason: {alert.failedReason}
            </p>
          )}
        </div>
      ),
    });
  });

  responses.forEach((response, index) => {
    const responderName = responders.get(response.responderId)?.name ?? response.responderId;
    items.push({
      id: `response-${response.id}`,
      at: response.at,
      order: 80 + index,
      label: "Response",
      tone: response.action === "resolved" ? "success" : "info",
      body: (
        <p className="font-medium text-ink">
          {responderName} {ACTION_LABELS[response.action]}
          {response.action === "acknowledged" && " · escalation cancelled"}
        </p>
      ),
    });
  });

  return items.sort(
    (a, b) =>
      new Date(a.at).getTime() - new Date(b.at).getTime() || a.order - b.order,
  );
}

function FactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-[0.1em] text-faint">
        {label}
      </dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

function LeadTimeFact({ event }: { event: IncursionEvent }) {
  if (event.firstDeliveryAt === null) {
    return <span>{event.state === "expired" ? "No alert sent" : "Pending"}</span>;
  }
  return (
    <span className="tnum">
      {formatElapsed(secondsBetween(event.openedAt, event.firstDeliveryAt))}
    </span>
  );
}

function ResponseFacts({
  event,
  responses,
}: {
  event: IncursionEvent;
  responses: EventResponse[];
}) {
  if (event.confirmedAt === null) {
    return <span>Suppressed before alerting</span>;
  }
  const ack = firstResponse(responses, "acknowledged");
  const onSite = firstResponse(responses, "on_site");
  const resolved = firstResponse(responses, "resolved");
  return (
    <span className="flex flex-col gap-0.5">
      <span>
        Ack:{" "}
        <span className="tnum">
          {ack === undefined
            ? "awaiting"
            : `+${formatElapsed(secondsBetween(event.confirmedAt, ack.at))}`}
        </span>
      </span>
      <span>
        On site:{" "}
        <span className="tnum">
          {onSite === undefined
            ? "—"
            : `+${formatElapsed(secondsBetween(event.confirmedAt, onSite.at))}`}
        </span>
      </span>
      <span>
        Resolved:{" "}
        <span className="tnum">
          {resolved === undefined
            ? "—"
            : `+${formatElapsed(secondsBetween(event.confirmedAt, resolved.at))}`}
        </span>
      </span>
    </span>
  );
}

function DeliveryFacts({
  alerts,
  responders,
  zones,
  nodes,
}: {
  alerts: Alert[];
  responders: ReadonlyMap<string, Responder>;
  zones: ReadonlyMap<string, VillagerZone>;
  nodes: ReadonlyMap<string, SensorNode>;
}) {
  if (alerts.length === 0) {
    return (
      <p className="text-sm font-medium text-status-unconfirmed">
        No alert rows — suppression held.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex flex-col gap-1 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">
              {CHANNEL_LABELS[alert.channel]}
            </span>
            <AlertStatusChip status={alert.status} />
            <HonestyChip mode={alert.isLive ? "live" : "simulated"} />
          </div>
          <p className="text-xs text-muted">
            Tier {alert.tier} · {targetLabel(alert, nodes, responders, zones)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function TierHistory({ alerts }: { alerts: Alert[] }) {
  const tiers = [...new Set(alerts.map((alert) => alert.tier))].sort((a, b) => a - b);
  if (tiers.length === 0) return <span>—</span>;
  return (
    <span>
      {tiers.map((tier) => `Tier ${tier}`).join(", ")}
    </span>
  );
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repos = getRuntimeRepositories();
  const event = repos.events.findById(id);
  if (event === null) notFound();

  const node = repos.nodes.findById(event.nodeId);
  if (node === null) notFound();

  const signals = repos.signals.listForEvent(event.id);
  const alerts = repos.alerts.listForEvent(event.id);
  const responses = repos.responses.listForEvent(event.id);
  const responderMap = new Map(
    repos.responders.list().map((responder) => [responder.id, responder]),
  );
  const zoneMap = new Map(repos.villagerZones.list().map((zone) => [zone.id, zone]));
  const nodeMap = new Map(repos.nodes.list().map((n) => [n.id, n]));
  const settings = repos.settings.get();
  const timeline = buildTimeline({
    event,
    node,
    signals,
    alerts,
    responses,
    responders: responderMap,
    zones: zoneMap,
    nodes: nodeMap,
    confirmationWindowS: settings.confirmationWindowS,
  });
  const headline =
    event.state === "expired"
      ? `Suppressed signal — ${node.name}`
      : `${titleCase(speciesLabel(event))} — ${node.name}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/command/events"
          className="text-sm font-medium text-accent hover:text-accent-hover"
        >
          Events log
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">{headline}</h1>
          <StatusChip status={event.state} />
        </div>
        <p className="text-sm text-muted">
          Opened <span className="tnum">{formatIstDateTime(event.openedAt)} IST</span>{" "}
          at{" "}
          <Link
            href={`/command/nodes/${node.id}`}
            className="font-medium text-accent hover:text-accent-hover"
          >
            {node.name}
          </Link>
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <section
          aria-labelledby="timeline-heading"
          className="min-w-0 rounded-lg border border-line bg-raised"
        >
          <div className="border-b border-line px-4 py-3 sm:px-6">
            <h2 id="timeline-heading" className="text-base font-medium">
              Cascade timeline
            </h2>
            <p className="mt-0.5 text-xs text-faint">
              Exact event facts, delivery proof, and response deltas.
            </p>
          </div>
          <ol className="divide-y divide-line">
            {timeline.map((item) => (
              <li
                key={item.id}
                className="grid gap-3 px-4 py-4 sm:grid-cols-[96px_96px_minmax(0,1fr)] sm:px-6"
              >
                <div className="tnum text-sm font-medium text-ink">
                  {formatIstTime(item.at)}
                </div>
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={`mt-1 size-2.5 rounded-full border-2 ${toneClass(item.tone)}`}
                  />
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
                      {item.label}
                    </p>
                    <p className="tnum text-xs text-muted">
                      {deltaLabel(event, item.at)}
                    </p>
                  </div>
                </div>
                <div className="min-w-0">{item.body}</div>
              </li>
            ))}
          </ol>
        </section>

        <aside
          aria-labelledby="event-facts-heading"
          className="min-w-0 rounded-lg border border-line bg-raised"
        >
          <div className="border-b border-line px-4 py-3 sm:px-6">
            <h2 id="event-facts-heading" className="text-base font-medium">
              Event facts
            </h2>
            <p className="mt-0.5 text-xs text-faint">
              Lead time, delivery status, and responder timestamps.
            </p>
          </div>
          <dl className="grid gap-4 px-4 py-4 sm:px-6">
            <FactRow label="Lead time" value={<LeadTimeFact event={event} />} />
            <FactRow label="Node" value={node.name} />
            <FactRow
              label="Confirmed"
              value={
                event.confirmedAt === null
                  ? "No — false-positive suppression"
                  : `${formatIstDateTime(event.confirmedAt)} IST`
              }
            />
            <FactRow label="Tier history" value={<TierHistory alerts={alerts} />} />
            <FactRow
              label="Response times"
              value={<ResponseFacts event={event} responses={responses} />}
            />
          </dl>
          <div className="border-t border-line px-4 py-4 sm:px-6">
            <h3 className="font-sans text-sm font-medium tracking-normal">
              Delivery statuses
            </h3>
            <DeliveryFacts
              alerts={alerts}
              responders={responderMap}
              zones={zoneMap}
              nodes={nodeMap}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

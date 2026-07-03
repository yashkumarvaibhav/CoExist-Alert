import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NodeDetailHeader } from "@/components/command/node-detail-header";
import { NodeHealthHistory } from "@/components/command/node-health-history";
import { HonestyChip } from "@/components/honesty-chip";
import { getRuntimeRepositories } from "@/db/runtime";
import type {
  IncursionEvent,
  Responder,
  Signal,
  SignalSource,
} from "@/domain/types";
import { bucketMeans } from "@/lib/sparkline";
import { formatIstDateTime } from "@/lib/time";

const DAY_MS = 24 * 60 * 60 * 1_000;
const CHART_BUCKET_MINUTES = 60;
const RECENT_SIGNAL_LIMIT = 12;
const LEDGER_LIMIT = 10;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const node = getRuntimeRepositories().nodes.findById(id);
  if (node === null) notFound();
  return {
    title: `${node.name} — CoExist Alert`,
  };
}

function sourceLabel(source: SignalSource): string {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function classificationLabel(classification: string): string {
  return classification.replace(/_/g, "-");
}

function confidenceLabel(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function eventReference(
  signal: Signal,
  eventsById: ReadonlyMap<string, IncursionEvent>,
) {
  if (signal.eventId === null) return "—";
  const event = eventsById.get(signal.eventId);
  const state = event?.state ?? "event";
  return (
    <Link
      href="/command/events"
      className="font-medium text-accent hover:text-accent-hover"
    >
      {state} · {signal.eventId.slice(0, 10)}
    </Link>
  );
}

function safeSnapshotPath(path: string | null): string | null {
  if (path === null) return null;
  return path.startsWith("/demo-snapshots/") ? path : null;
}

function roleLabel(role: Responder["role"]): string {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildHealthWindow() {
  const nowMs = Date.now();
  return {
    from: new Date(nowMs - DAY_MS).toISOString(),
    to: new Date(nowMs).toISOString(),
    bucketMinutes: CHART_BUCKET_MINUTES,
  };
}

function SignalsTable({
  signals,
  eventsById,
}: {
  signals: Signal[];
  eventsById: ReadonlyMap<string, IncursionEvent>;
}) {
  return (
    <section
      aria-labelledby="recent-signals-heading"
      className="min-w-0 rounded-lg border border-line bg-raised"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-6">
        <div>
          <h2 id="recent-signals-heading" className="text-base font-medium">
            Recent field signals
          </h2>
          <p className="mt-0.5 text-xs text-faint">
            Edge payloads are shaped like Meraki MV Sense detections
          </p>
        </div>
        <HonestyChip mode="simulated" />
      </div>

      {signals.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">
          No recent signals recorded for this node.
        </p>
      ) : (
        <div
          className="overflow-x-auto"
          tabIndex={0}
          aria-label="Recent field signals table"
        >
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-faint">
                <th scope="col" className="px-4 py-3 font-medium sm:px-6">
                  Time
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Source
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Classification
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Confidence
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Snapshot
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Event
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {signals.map((signal) => {
                const snapshot = safeSnapshotPath(signal.snapshotPath);
                return (
                  <tr key={signal.id}>
                    <td className="tnum px-4 py-2.5 text-body sm:px-6">
                      {formatIstDateTime(signal.at)} IST
                    </td>
                    <td className="px-4 py-2.5 text-ink">
                      {sourceLabel(signal.source)}
                    </td>
                    <td className="px-4 py-2.5 text-body">
                      {classificationLabel(signal.classification)}
                    </td>
                    <td className="tnum px-4 py-2.5 text-ink">
                      {confidenceLabel(signal.confidence)}
                    </td>
                    <td className="px-4 py-2.5">
                      {snapshot === null ? (
                        <span className="text-xs text-faint">No snapshot</span>
                      ) : (
                        <span
                          role="img"
                          aria-label={`SIMULATED snapshot for ${classificationLabel(
                            signal.classification,
                          )}`}
                          className="block h-12 w-16 rounded-sm border border-line bg-cover bg-center"
                          style={{ backgroundImage: `url(${snapshot})` }}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {eventReference(signal, eventsById)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RespondersPanel({ responders }: { responders: Responder[] }) {
  return (
    <section
      aria-labelledby="assigned-responders-heading"
      className="min-w-0 rounded-lg border border-line bg-raised"
    >
      <div className="border-b border-line px-4 py-3 sm:px-6">
        <h2 id="assigned-responders-heading" className="text-base font-medium">
          Assigned responders
        </h2>
        <p className="mt-0.5 text-xs text-faint">
          Tiered dispatch targets for this node
        </p>
      </div>

      {responders.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-status-degraded">
          No responder assignment found.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {responders.map((responder) => (
            <li
              key={responder.id}
              className="flex flex-col gap-1 px-4 py-3 sm:px-6"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{responder.name}</span>
                <span className="rounded-sm border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                  Tier {responder.tier}
                </span>
                <span className="text-xs text-faint">
                  {roleLabel(responder.role)}
                </span>
              </div>
              <p className="text-sm text-muted">
                {responder.phoneLabel}
                {responder.webexEmail !== null && (
                  <span className="tnum"> · {responder.webexEmail}</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function NodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repos = getRuntimeRepositories();
  const node = repos.nodes.findById(id);
  if (node === null) notFound();

  const window = buildHealthWindow();
  const heartbeats = repos.heartbeats.listForNodeSince(node.id, window.from);
  const batterySeries = bucketMeans(
    heartbeats.map((heartbeat) => ({
      at: heartbeat.at,
      value: heartbeat.batteryPct,
    })),
    window,
  );
  const linkSeries = bucketMeans(
    heartbeats.map((heartbeat) => ({
      at: heartbeat.at,
      value: heartbeat.linkQualityPct,
    })),
    window,
  );
  const outageBands = repos.outages.listForNodeWindow(
    node.id,
    window.from,
    window.to,
  );
  const ledgerOutages = repos.outages
    .listForNode(node.id)
    .slice(-LEDGER_LIMIT)
    .reverse();
  const recentSignals = repos.signals.listRecentForNode(
    node.id,
    RECENT_SIGNAL_LIMIT,
  );
  const eventsById = new Map(
    recentSignals
      .map((signal) =>
        signal.eventId === null ? null : repos.events.findById(signal.eventId),
      )
      .filter((event): event is IncursionEvent => event !== null)
      .map((event) => [event.id, event]),
  );
  const responders = repos.responders.listForNode(node.id);

  return (
    <div className="flex flex-col gap-6">
      <NodeDetailHeader node={node} />

      <NodeHealthHistory
        batterySeries={batterySeries}
        linkSeries={linkSeries}
        outageBands={outageBands}
        ledgerOutages={ledgerOutages}
        fromIso={window.from}
        toIso={window.to}
      />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)]">
        <SignalsTable signals={recentSignals} eventsById={eventsById} />
        <RespondersPanel responders={responders} />
      </div>
    </div>
  );
}

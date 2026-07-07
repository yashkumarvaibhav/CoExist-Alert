import type { Metadata } from "next";

import { HonestyChip } from "@/components/honesty-chip";
import { HotspotHeatmap } from "@/components/command/hotspot-heatmap";
import {
  AnalyticsWindowSelector,
  ReliabilityAnalytics,
} from "@/components/command/reliability-analytics";
import { getRuntimeRepositories } from "@/db/runtime";
import {
  analyticsWindow,
  buildHotspotAnalytics,
  buildReliabilityAnalytics,
  type AnalyticsWindowKey,
} from "@/lib/analytics";

export const metadata: Metadata = {
  title: "Analytics & hotspots — CoExist Alert",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function AnalyticsExportLink({ windowKey }: { windowKey: AnalyticsWindowKey }) {
  return (
    <a
      href={`/api/export/events.ndjson?window=${windowKey}`}
      download="coexist-events.ndjson"
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-raised px-3 text-sm font-medium text-ink transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <DownloadIcon className="size-4 shrink-0 text-muted" />
      <span>Export NDJSON</span>
      <HonestyChip mode="simulated" />
    </a>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const repos = getRuntimeRepositories();
  const nodes = repos.nodes.list();
  const params = await searchParams;
  const window = analyticsWindow(firstValue(params.window));
  const events = repos.events.listConfirmedBetween(window.fromIso, window.toIso);
  const eventIds = new Set(events.map((event) => event.id));
  const snapshot = buildHotspotAnalytics({ nodes, events, window });
  const alerts = repos.alerts
    .listSince(window.fromIso)
    .filter(
      (alert) =>
        alert.queuedAt < window.toIso &&
        alert.eventId !== null &&
        eventIds.has(alert.eventId),
    )
    .map((alert) => ({ channel: alert.channel, status: alert.status }));
  const responses = events.flatMap((event) =>
    repos.responses.listForEvent(event.id).map((response) => ({
      eventId: response.eventId,
      action: response.action,
      at: response.at,
    })),
  );
  const outagesByNode = Object.fromEntries(
    nodes.map((node) => [
      node.id,
      repos.outages.listForNodeWindow(node.id, window.fromIso, window.toIso),
    ]),
  );
  const reliability = buildReliabilityAnalytics({
    window,
    nodes,
    events,
    alerts,
    responses,
    outagesByNode,
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Analytics &amp; hotspots</h1>
          <p className="mt-1 text-sm text-muted">
            Time-of-day risk analysis for planning patrols and rail advisories.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AnalyticsWindowSelector active={window.key} />
          <AnalyticsExportLink windowKey={window.key} />
        </div>
      </header>

      <HotspotHeatmap snapshot={snapshot} />
      <ReliabilityAnalytics snapshot={reliability} />
    </div>
  );
}

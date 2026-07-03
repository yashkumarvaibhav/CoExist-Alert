import type { Metadata } from "next";

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
} from "@/lib/analytics";

export const metadata: Metadata = {
  title: "Analytics & hotspots — CoExist Alert",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
        <AnalyticsWindowSelector active={window.key} />
      </header>

      <HotspotHeatmap snapshot={snapshot} />
      <ReliabilityAnalytics snapshot={reliability} />
    </div>
  );
}

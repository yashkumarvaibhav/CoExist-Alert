import type { Metadata } from "next";

import { HotspotHeatmap } from "@/components/command/hotspot-heatmap";
import { getRuntimeRepositories } from "@/db/runtime";
import { buildHotspotAnalytics, hotspotWindow } from "@/lib/analytics";

export const metadata: Metadata = {
  title: "Analytics & hotspots — CoExist Alert",
};

export default function AnalyticsPage() {
  const repos = getRuntimeRepositories();
  const nodes = repos.nodes.list();
  const window = hotspotWindow();
  const events = repos.events.listConfirmedBetween(window.fromIso, window.toIso);
  const snapshot = buildHotspotAnalytics({ nodes, events, window });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Analytics &amp; hotspots</h1>
        <p className="mt-1 text-sm text-muted">
          Time-of-day risk analysis for planning patrols and rail advisories.
        </p>
      </header>

      <HotspotHeatmap snapshot={snapshot} />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { LiveMap } from "@/components/command/live-map";
import { NODE_KIND_LABELS, NodeKindIcon } from "@/components/node-kind-icon";
import { StatusChip } from "@/components/status-chip";
import { getRuntimeRepositories } from "@/db/runtime";
import { formatIstTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Command dashboard — CoExist Alert",
};

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

export default function CommandDashboardPage() {
  const repos = getRuntimeRepositories();
  const nodes = repos.nodes.list();
  const openEvents = repos.events.listOpen();
  const nodeNames = new Map(nodes.map((node) => [node.id, node.name]));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Command dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Live field state for the Dooars corridor pilot — all times IST.
        </p>
      </header>

      <section
        aria-label="Live network map"
        className="overflow-hidden rounded-lg border border-line bg-raised"
      >
        <div className="h-[46vh] min-h-80">
          <LiveMap
            nodes={nodes.map((node) => ({
              id: node.id,
              name: node.name,
              kind: node.kind,
              lat: node.lat,
              lng: node.lng,
              geofenceRadiusM: node.geofenceRadiusM,
              status: node.status,
              batteryPct: node.batteryPct,
              linkQualityPct: node.linkQualityPct,
              lastHeartbeatAt: node.lastHeartbeatAt,
            }))}
            activeEvents={openEvents
              .filter(
                (event) =>
                  event.state === "confirmed" || event.state === "responding",
              )
              .map((event) => ({ id: event.id, nodeId: event.nodeId }))}
          />
        </div>
      </section>

      <section
        aria-labelledby="network-heading"
        className="rounded-lg border border-line bg-raised"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 id="network-heading" className="text-base font-medium">
            Sensor network
          </h2>
          <span className="tnum text-xs text-faint">
            {nodes.length} nodes · {openEvents.length} open{" "}
            {openEvents.length === 1 ? "event" : "events"}
          </span>
        </div>
        <ul className="divide-y divide-line">
          {nodes.map((node) => (
            <li key={node.id}>
              <Link
                href={`/command/nodes/${node.id}`}
                className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-hover"
              >
                <NodeKindIcon kind={node.kind} className="size-4 shrink-0 text-muted" />
                <span className="font-medium text-ink">{node.name}</span>
                <span className="text-xs text-faint">
                  {NODE_KIND_LABELS[node.kind]}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="tnum text-xs text-muted">
                    battery {pct(node.batteryPct)} · link {pct(node.linkQualityPct)} ·
                    beat{" "}
                    {node.lastHeartbeatAt === null
                      ? "never"
                      : formatIstTime(node.lastHeartbeatAt)}
                  </span>
                  <StatusChip status={node.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="open-events-heading"
        className="rounded-lg border border-line bg-raised"
      >
        <div className="border-b border-line px-4 py-3">
          <h2 id="open-events-heading" className="text-base font-medium">
            Open events
          </h2>
        </div>
        {openEvents.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            All quiet on the boundary — no open events.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {openEvents.map((event) => (
              <li
                key={event.id}
                className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3"
              >
                <StatusChip status={event.state} />
                <span className="font-medium text-ink">
                  {event.speciesLabel ?? "Awaiting corroboration"}
                </span>
                <span className="text-sm text-muted">
                  {nodeNames.get(event.nodeId) ?? event.nodeId}
                </span>
                <span className="tnum ml-auto text-xs text-faint">
                  opened {formatIstTime(event.openedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-line px-4 py-3">
          <Link
            href="/command/events"
            className="text-sm font-medium text-accent hover:text-accent-hover"
          >
            View full events log →
          </Link>
        </div>
      </section>
    </div>
  );
}

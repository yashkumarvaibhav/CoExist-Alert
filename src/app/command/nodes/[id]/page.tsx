import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NODE_KIND_LABELS, NodeKindIcon } from "@/components/node-kind-icon";
import { StatusChip } from "@/components/status-chip";
import { getRuntimeRepositories } from "@/db/runtime";
import { formatIstDateTime, formatIstTime } from "@/lib/time";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const node = getRuntimeRepositories().nodes.findById(id);
  return {
    title: node === null
      ? "Node not found — CoExist Alert"
      : `${node.name} — CoExist Alert`,
  };
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

export default async function NodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const node = getRuntimeRepositories().nodes.findById(id);
  if (node === null) notFound();

  const facts: Array<[string, string]> = [
    ["Kind", NODE_KIND_LABELS[node.kind]],
    ["Coordinates", `${node.lat.toFixed(4)}, ${node.lng.toFixed(4)}`],
    ["Geofence radius", `${node.geofenceRadiusM} m`],
    ["Battery", pct(node.batteryPct)],
    ["Link quality", pct(node.linkQualityPct)],
    [
      "Last heartbeat",
      node.lastHeartbeatAt === null
        ? "never"
        : `${formatIstTime(node.lastHeartbeatAt)} IST`,
    ],
    ["Provisioned", `${formatIstDateTime(node.createdAt)} IST`],
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <NodeKindIcon kind={node.kind} className="size-6 shrink-0 text-muted" />
        <h1 className="text-3xl">{node.name}</h1>
        <StatusChip status={node.status} />
      </header>

      <section
        aria-label="Node facts"
        className="rounded-lg border border-line bg-raised px-4 py-4 sm:px-6"
      >
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-[11px] uppercase tracking-[0.1em] text-faint">
                {label}
              </dt>
              <dd className="tnum text-sm text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-lg border border-line bg-raised px-6 py-10 text-center text-sm text-muted">
        Health history, the outage ledger and recent signals for this node
        arrive with the full node console.
      </section>
    </div>
  );
}

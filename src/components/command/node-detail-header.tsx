"use client";

import { useCallback, useState, type ReactNode } from "react";

import { NODE_KIND_LABELS, NodeKindIcon } from "@/components/node-kind-icon";
import { StatusChip } from "@/components/status-chip";
import type { SensorNode } from "@/domain/types";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useNowMs } from "@/hooks/use-now";
import { formatElapsed, formatIstDateTime, formatIstTime } from "@/lib/time";
import type { FieldStreamEvent, StreamEventType } from "@/stream/events";

const NODE_HEADER_EVENTS: readonly StreamEventType[] = ["node-status"];

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function LastHeartbeat({ iso }: { iso: string | null }) {
  const nowMs = useNowMs();
  if (iso === null) return <span className="tnum">never</span>;
  const timestamp = `${formatIstTime(iso)} IST`;
  if (nowMs === null) return <span className="tnum">{timestamp}</span>;
  return (
    <span className="tnum">
      {timestamp}
      <span className="text-muted">
        {" "}
        · {formatElapsed((nowMs - new Date(iso).getTime()) / 1_000)} ago
      </span>
    </span>
  );
}

export function NodeDetailHeader({ node }: { node: SensorNode }) {
  const [current, setCurrent] = useState<SensorNode>(() => node);

  const onStreamEvent = useCallback(
    (streamEvent: FieldStreamEvent) => {
      if (streamEvent.type !== "node-status") return;
      const payload = streamEvent.payload;
      if (payload.nodeId !== node.id) return;
      setCurrent((previous) => ({
        ...previous,
        status: payload.status,
        batteryPct: payload.batteryPct,
        linkQualityPct: payload.linkQualityPct,
        lastHeartbeatAt: payload.lastHeartbeatAt,
      }));
    },
    [node.id],
  );

  useLiveStream({ types: NODE_HEADER_EVENTS, onEvent: onStreamEvent });

  const facts: Array<[string, ReactNode]> = [
    ["Kind", NODE_KIND_LABELS[current.kind]],
    ["Coordinates", `${current.lat.toFixed(4)}, ${current.lng.toFixed(4)}`],
    ["Geofence radius", `${current.geofenceRadiusM} m`],
    ["Battery", pct(current.batteryPct)],
    ["Link quality", pct(current.linkQualityPct)],
    ["Last heartbeat", <LastHeartbeat key="last-heartbeat" iso={current.lastHeartbeatAt} />],
    ["Provisioned", `${formatIstDateTime(current.createdAt)} IST`],
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <NodeKindIcon kind={current.kind} className="size-6 shrink-0 text-muted" />
        <h1 className="text-3xl">{current.name}</h1>
        <StatusChip status={current.status} />
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
              <dd className="text-sm text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

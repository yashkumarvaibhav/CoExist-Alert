"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { NODE_KIND_LABELS, NodeKindIcon } from "@/components/node-kind-icon";
import { StatusChip } from "@/components/status-chip";
import type { NodeKind, NodeStatus } from "@/domain/types";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useNowMs } from "@/hooks/use-now";
import { formatElapsed } from "@/lib/time";
import type { FieldStreamEvent, StreamEventType } from "@/stream/events";

/**
 * Sensor Health Board — one live row per node: status chip, battery/link
 * bars, heartbeat age, 24h link sparkline. An offline node is a blind spot
 * and says so loudly, with the blind minutes counting up.
 */

export interface HealthNode {
  id: string;
  name: string;
  kind: NodeKind;
  status: NodeStatus;
  batteryPct: number | null;
  linkQualityPct: number | null;
  lastHeartbeatAt: string | null;
}

export interface OpenOutageSeed {
  id: string;
  nodeId: string;
  startedAt: string;
}

const BOARD_EVENT_TYPES: readonly StreamEventType[] = ["node-status", "outage"];

function barColorClass(value: number): string {
  if (value < 20) return "bg-status-offline";
  if (value < 35) return "bg-status-degraded";
  return "bg-muted";
}

function LevelBar({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-11 text-[10px] uppercase tracking-[0.08em] text-faint">
        {label}
      </span>
      <span
        aria-hidden="true"
        className="h-1.5 w-14 overflow-hidden rounded-full bg-hover"
      >
        {value !== null && (
          <span
            className={`block h-full rounded-full ${barColorClass(value)}`}
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          />
        )}
      </span>
      <span className="tnum w-9 text-right text-xs text-body">
        {value === null ? "—" : `${Math.round(value)}%`}
      </span>
    </span>
  );
}

function Sparkline({ series }: { series: Array<number | null> }) {
  const width = 96;
  const height = 24;
  const step = series.length > 1 ? width / (series.length - 1) : width;

  const segments: string[] = [];
  let current: string[] = [];
  series.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    const x = (index * step).toFixed(1);
    const y = (height - 2 - (value / 100) * (height - 4)).toFixed(1);
    current.push(`${x},${y}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  if (segments.length === 0) {
    return <span className="text-[10px] text-faint">no 24h data</span>;
  }
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 text-muted"
    >
      {segments.map((points) => (
        <polyline
          key={points}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function HeartbeatAge({ iso }: { iso: string | null }) {
  const nowMs = useNowMs();
  if (iso === null) return <span className="tnum">never</span>;
  if (nowMs === null) return <span className="tnum">—</span>;
  return (
    <span className="tnum">
      {formatElapsed((nowMs - new Date(iso).getTime()) / 1_000)} ago
    </span>
  );
}

function BlindMinutes({ since }: { since: string }) {
  const nowMs = useNowMs();
  if (nowMs === null) return null;
  return (
    <span className="tnum">
      {formatElapsed((nowMs - new Date(since).getTime()) / 1_000)}
    </span>
  );
}

export function HealthBoard({
  initialNodes,
  sparklines,
  initialOpenOutages,
}: {
  initialNodes: HealthNode[];
  sparklines: Record<string, Array<number | null>>;
  initialOpenOutages: OpenOutageSeed[];
}) {
  const [nodes, setNodes] = useState<ReadonlyMap<string, HealthNode>>(
    () => new Map(initialNodes.map((node) => [node.id, node])),
  );
  const [openOutages, setOpenOutages] = useState<
    ReadonlyMap<string, OpenOutageSeed>
  >(
    () =>
      new Map(initialOpenOutages.map((outage) => [outage.nodeId, outage])),
  );

  const onStreamEvent = useCallback((streamEvent: FieldStreamEvent) => {
    if (streamEvent.type === "node-status") {
      const payload = streamEvent.payload;
      setNodes((current) => {
        const node = current.get(payload.nodeId);
        if (node === undefined) return current;
        const next = new Map(current);
        next.set(payload.nodeId, {
          ...node,
          status: payload.status,
          batteryPct: payload.batteryPct,
          linkQualityPct: payload.linkQualityPct,
          lastHeartbeatAt: payload.lastHeartbeatAt,
        });
        return next;
      });
      return;
    }
    if (streamEvent.type === "outage") {
      const payload = streamEvent.payload;
      setOpenOutages((current) => {
        const next = new Map(current);
        if (payload.endedAt === null) {
          next.set(payload.nodeId, {
            id: payload.id,
            nodeId: payload.nodeId,
            startedAt: payload.startedAt,
          });
        } else if (next.get(payload.nodeId)?.id === payload.id) {
          next.delete(payload.nodeId);
        }
        return next;
      });
    }
  }, []);

  useLiveStream({ types: BOARD_EVENT_TYPES, onEvent: onStreamEvent });

  return (
    <section
      aria-labelledby="health-heading"
      className="rounded-lg border border-line bg-raised"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="health-heading" className="text-base font-medium">
          Sensor health
        </h2>
        <span className="text-xs text-faint">
          Reliability model: ThousandEyes agent tests
        </span>
      </div>
      <ul className="divide-y divide-line">
        {[...nodes.values()].map((node) => {
          const outage = openOutages.get(node.id);
          const blind = node.status === "offline";
          return (
            <li
              key={node.id}
              data-node-id={node.id}
              data-node-status={node.status}
              className={`flex flex-col gap-2 px-4 py-3 ${
                blind ? "bg-status-offline/5" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <NodeKindIcon
                  kind={node.kind}
                  className="size-4 shrink-0 text-muted"
                />
                <Link
                  href={`/command/nodes/${node.id}`}
                  className="font-medium text-ink hover:text-accent"
                >
                  {node.name}
                </Link>
                <span className="text-xs text-faint">
                  {NODE_KIND_LABELS[node.kind]}
                </span>
                <span className="ml-auto flex items-center gap-3">
                  <span className="tnum text-xs text-muted">
                    <HeartbeatAge iso={node.lastHeartbeatAt} />
                  </span>
                  <StatusChip status={node.status} />
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                <LevelBar label="battery" value={node.batteryPct} />
                <LevelBar label="link" value={node.linkQualityPct} />
                <span className="ml-auto">
                  <Sparkline series={sparklines[node.id] ?? []} />
                </span>
              </div>
              {blind && (
                <p className="text-sm font-medium text-status-offline">
                  Corridor blind — dispatch patrol
                  {outage !== undefined && (
                    <span className="ml-2 font-normal text-muted">
                      blind for <BlindMinutes since={outage.startedAt} />
                    </span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { StatusChip } from "@/components/status-chip";
import type { EventState } from "@/domain/types";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useNowMs } from "@/hooks/use-now";
import { formatElapsed, formatIstTime } from "@/lib/time";
import type { FieldStreamEvent, StreamEventType } from "@/stream/events";

/**
 * Live event feed — reverse-chron field activity: signals (quiet), events
 * (unconfirmed / confirmed / resolved / expired) and blind-spot outages.
 * Seeded server-side, kept current by the SSE stream; relevant deltas also
 * refresh the server-computed KPI strip (throttled).
 */

export type FeedItem =
  | {
      kind: "signal";
      id: string;
      at: string;
      nodeId: string;
      source: string;
      classification: string;
      confidence: number;
      snapshotPath: string | null;
      eventId: string | null;
    }
  | {
      kind: "event";
      id: string;
      at: string;
      nodeId: string;
      state: EventState;
      speciesLabel: string | null;
      openedAt: string;
      confirmedAt: string | null;
    }
  | {
      kind: "outage";
      id: string;
      at: string;
      nodeId: string;
      startedAt: string;
      endedAt: string | null;
    };

const FEED_EVENT_TYPES: readonly StreamEventType[] = [
  "signal",
  "event",
  "outage",
  "delivery",
];
const FEED_CAP = 30;
const KPI_REFRESH_THROTTLE_MS = 4_000;

function itemKey(item: FeedItem): string {
  return `${item.kind}:${item.id}`;
}

function toFeedItem(streamEvent: FieldStreamEvent): FeedItem | null {
  switch (streamEvent.type) {
    case "signal": {
      const s = streamEvent.payload;
      return {
        kind: "signal",
        id: s.id,
        at: s.at,
        nodeId: s.nodeId,
        source: s.source,
        classification: s.classification,
        confidence: s.confidence,
        snapshotPath: s.snapshotPath,
        eventId: s.eventId,
      };
    }
    case "event": {
      const e = streamEvent.payload;
      return {
        kind: "event",
        id: e.id,
        at: e.resolvedAt ?? e.confirmedAt ?? e.openedAt,
        nodeId: e.nodeId,
        state: e.state,
        speciesLabel: e.speciesLabel,
        openedAt: e.openedAt,
        confirmedAt: e.confirmedAt,
      };
    }
    case "outage": {
      const o = streamEvent.payload;
      return {
        kind: "outage",
        id: o.id,
        at: o.endedAt ?? o.startedAt,
        nodeId: o.nodeId,
        startedAt: o.startedAt,
        endedAt: o.endedAt,
      };
    }
    default:
      return null;
  }
}

function ElapsedSince({ iso }: { iso: string }) {
  const nowMs = useNowMs();
  if (nowMs === null) return <span className="tnum">—</span>;
  return (
    <span className="tnum">
      {formatElapsed((nowMs - new Date(iso).getTime()) / 1_000)}
    </span>
  );
}

function prettyLabel(speciesLabel: string | null): string {
  if (speciesLabel === null) return "Large animal";
  const dashed = speciesLabel.replace(/_/g, "-");
  return dashed.charAt(0).toUpperCase() + dashed.slice(1);
}

function CardShell({
  borderClass,
  eyebrow,
  at,
  children,
  dataAttrs,
}: {
  borderClass: string;
  eyebrow: string;
  at: string;
  children: React.ReactNode;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <li
      {...dataAttrs}
      className={`rounded-lg border bg-raised px-3 py-2.5 ${borderClass}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
          {eyebrow}
        </span>
        <time className="tnum text-xs text-faint">{formatIstTime(at)}</time>
      </div>
      {children}
    </li>
  );
}

function EventCard({
  item,
  nodeName,
  snapshotPath,
}: {
  item: Extract<FeedItem, { kind: "event" }>;
  nodeName: string;
  snapshotPath: string | null;
}) {
  const dataAttrs = {
    "data-event-id": item.id,
    "data-event-state": item.state,
  };

  if (item.state === "unconfirmed") {
    return (
      <CardShell
        borderClass="border-status-unconfirmed/50"
        eyebrow="Event"
        at={item.at}
        dataAttrs={dataAttrs}
      >
        <p className="mt-1 text-sm text-body">
          Possible incursion — {nodeName}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
          <StatusChip status="unconfirmed" />
          single signal · awaiting corroboration
        </div>
      </CardShell>
    );
  }

  if (item.state === "expired") {
    return (
      <CardShell
        borderClass="border-line"
        eyebrow="Event"
        at={item.at}
        dataAttrs={dataAttrs}
      >
        <p className="mt-1 text-sm text-muted">
          No alert sent — low-confidence signal expired at {nodeName}
        </p>
        <div className="mt-1">
          <StatusChip status="expired" />
        </div>
      </CardShell>
    );
  }

  if (item.state === "resolved") {
    return (
      <CardShell
        borderClass="border-line"
        eyebrow="Event"
        at={item.at}
        dataAttrs={dataAttrs}
      >
        <p className="mt-1 text-sm text-body">
          Resolved — {prettyLabel(item.speciesLabel).toLowerCase()} incursion at{" "}
          {nodeName}
        </p>
        <div className="mt-1">
          <StatusChip status="resolved" />
        </div>
      </CardShell>
    );
  }

  // confirmed / responding — the loud card.
  return (
    <CardShell
      borderClass={
        item.state === "responding"
          ? "border-status-advisory/50"
          : "border-status-confirmed/50"
      }
      eyebrow="Event"
      at={item.at}
      dataAttrs={dataAttrs}
    >
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-base font-medium text-ink">
            {prettyLabel(item.speciesLabel)} confirmed — {nodeName}
          </p>
          <p className="mt-1 text-xs text-muted">
            <ElapsedSince iso={item.confirmedAt ?? item.openedAt} /> since
            confirmation
          </p>
          <div className="mt-1.5">
            <StatusChip status={item.state} />
          </div>
        </div>
        {snapshotPath !== null && (
          <Image
            src={snapshotPath}
            alt="Detection snapshot"
            width={64}
            height={48}
            unoptimized
            className="h-12 w-16 shrink-0 rounded-sm border border-line bg-white object-cover"
          />
        )}
      </div>
    </CardShell>
  );
}

function FeedCard({
  item,
  nodeName,
  snapshotPath,
}: {
  item: FeedItem;
  nodeName: string;
  snapshotPath: string | null;
}) {
  if (item.kind === "signal") {
    return (
      <CardShell borderClass="border-line" eyebrow="Signal" at={item.at}>
        <p className="mt-1 text-sm text-body">
          {item.source} · {item.classification} ·{" "}
          <span className="tnum">{item.confidence.toFixed(2)}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted">{nodeName}</p>
      </CardShell>
    );
  }

  if (item.kind === "outage") {
    if (item.endedAt === null) {
      return (
        <CardShell
          borderClass="border-status-offline/50"
          eyebrow="Blind spot"
          at={item.at}
        >
          <p className="mt-1 font-serif text-base font-medium text-ink">
            Corridor blind — {nodeName} offline
          </p>
          <p className="mt-1 text-xs text-muted">
            Dispatch patrol · dark since {formatIstTime(item.startedAt)} IST
          </p>
          <div className="mt-1.5">
            <StatusChip status="offline" />
          </div>
        </CardShell>
      );
    }
    return (
      <CardShell borderClass="border-line" eyebrow="Blind spot" at={item.at}>
        <p className="mt-1 text-sm text-body">
          Coverage restored — {nodeName}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          blind{" "}
          <span className="tnum">
            {formatElapsed(
              (new Date(item.endedAt).getTime() -
                new Date(item.startedAt).getTime()) /
                1_000,
            )}
          </span>{" "}
          · restored {formatIstTime(item.endedAt)} IST
        </p>
        <div className="mt-1.5">
          <StatusChip status="healthy" />
        </div>
      </CardShell>
    );
  }

  return (
    <EventCard item={item} nodeName={nodeName} snapshotPath={snapshotPath} />
  );
}

export function LiveFeed({
  initialItems,
  nodeNames,
}: {
  initialItems: FeedItem[];
  nodeNames: Record<string, string>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ReadonlyMap<string, FeedItem>>(
    () => new Map(initialItems.map((item) => [itemKey(item), item])),
  );
  const lastRefreshRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The KPI strip is server-computed; nudge it when the numbers can change.
  const scheduleKpiRefresh = useCallback(() => {
    const sinceLast = Date.now() - lastRefreshRef.current;
    if (sinceLast >= KPI_REFRESH_THROTTLE_MS) {
      lastRefreshRef.current = Date.now();
      router.refresh();
    } else if (refreshTimerRef.current === null) {
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        lastRefreshRef.current = Date.now();
        router.refresh();
      }, KPI_REFRESH_THROTTLE_MS - sinceLast);
    }
  }, [router]);

  const onStreamEvent = useCallback(
    (streamEvent: FieldStreamEvent) => {
      const item = toFeedItem(streamEvent);
      if (item !== null) {
        setItems((current) => {
          const next = new Map(current);
          next.set(itemKey(item), item);
          return next;
        });
      }
      if (streamEvent.type !== "signal") scheduleKpiRefresh();
    },
    [scheduleKpiRefresh],
  );

  useLiveStream({ types: FEED_EVENT_TYPES, onEvent: onStreamEvent });

  const sorted = [...items.values()]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, FEED_CAP);

  const snapshotByEvent = new Map<string, string>();
  for (const item of items.values()) {
    if (
      item.kind === "signal" &&
      item.eventId !== null &&
      item.snapshotPath !== null &&
      !snapshotByEvent.has(item.eventId)
    ) {
      snapshotByEvent.set(item.eventId, item.snapshotPath);
    }
  }

  if (sorted.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-sm text-muted">
        All quiet on the boundary — field activity will appear here live.
      </p>
    );
  }

  return (
    <ol
      aria-live="polite"
      aria-label="Live field activity"
      tabIndex={0}
      className="flex max-h-[46vh] min-h-80 flex-col gap-2 overflow-y-auto pr-1"
    >
      {sorted.map((item) => (
        <FeedCard
          key={itemKey(item)}
          item={item}
          nodeName={nodeNames[item.nodeId] ?? item.nodeId}
          snapshotPath={
            item.kind === "event"
              ? (snapshotByEvent.get(item.id) ?? null)
              : null
          }
        />
      ))}
    </ol>
  );
}

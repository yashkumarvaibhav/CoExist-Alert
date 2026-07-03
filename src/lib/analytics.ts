import {
  blindSpotMinutes,
  deliveryRateByChannel,
  hotspotBuckets,
  leadTimeStats,
  overallDeliveryRate,
  responseStats,
  uptimePct,
  type DeliverySample,
  type Metric,
  type OutageSample,
  type ResponseSample,
} from "@/domain/metrics";
import type { AlertChannel, NodeKind } from "@/domain/types";

const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;

export const HOTSPOT_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export const DAWN_HOURS = [4, 5, 6, 7] as const;
export const DUSK_HOURS = [17, 18, 19, 20] as const;
export const ANALYTICS_WINDOWS = ["30d", "7d", "1h"] as const;
const ALERT_CHANNELS: AlertChannel[] = [
  "siren",
  "villager_phone",
  "guard_webex",
  "control_room",
  "blindspot_ops",
];

export interface HotspotWindow {
  fromIso: string;
  toIso: string;
  key: AnalyticsWindowKey;
  label: string;
  days: number;
}

export type AnalyticsWindowKey = (typeof ANALYTICS_WINDOWS)[number];

export interface HotspotAnalyticsNode {
  id: string;
  name: string;
  kind: NodeKind;
}

export interface HotspotAnalyticsEvent {
  nodeId: string;
  confirmedAt: string | null;
}

export interface HotspotCell {
  nodeId: string;
  hour: number;
  count: number;
}

export interface HotspotRow {
  nodeId: string;
  nodeName: string;
  kind: NodeKind;
  total: number;
  peakHour: number | null;
  cells: HotspotCell[];
}

export interface HotspotPeak {
  nodeId: string;
  nodeName: string;
  hour: number;
  count: number;
}

export interface HotspotAnalyticsSnapshot {
  window: HotspotWindow;
  rows: HotspotRow[];
  sampleSize: number;
  maxCount: number;
  dawnCount: number;
  duskCount: number;
  peak: HotspotPeak | null;
}

export function hotspotWindow(now = new Date(), days = 30): HotspotWindow {
  return {
    fromIso: new Date(now.getTime() - days * DAY_MS).toISOString(),
    toIso: now.toISOString(),
    key: days === 7 ? "7d" : "30d",
    label: `${days} d`,
    days,
  };
}

export function analyticsWindow(
  key: string | undefined,
  now = new Date(),
): HotspotWindow {
  const windowKey: AnalyticsWindowKey = ANALYTICS_WINDOWS.includes(
    key as AnalyticsWindowKey,
  )
    ? (key as AnalyticsWindowKey)
    : "30d";
  if (windowKey === "1h") {
    return {
      fromIso: new Date(now.getTime() - HOUR_MS).toISOString(),
      toIso: now.toISOString(),
      key: "1h",
      label: "1 h",
      days: 1 / 24,
    };
  }
  return hotspotWindow(now, windowKey === "7d" ? 7 : 30);
}

function isInHours(hour: number, hours: readonly number[]): boolean {
  return hours.includes(hour);
}

export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function buildHotspotAnalytics({
  nodes,
  events,
  window,
}: {
  nodes: HotspotAnalyticsNode[];
  events: HotspotAnalyticsEvent[];
  window: HotspotWindow;
}): HotspotAnalyticsSnapshot {
  const bucketMap = new Map(
    hotspotBuckets(events).map((bucket) => [
      `${bucket.nodeId}:${bucket.hour}`,
      bucket.count,
    ]),
  );
  const rows = nodes.map((node): HotspotRow => {
    const cells = HOTSPOT_HOURS.map((hour): HotspotCell => ({
      nodeId: node.id,
      hour,
      count: bucketMap.get(`${node.id}:${hour}`) ?? 0,
    }));
    const total = cells.reduce((sum, cell) => sum + cell.count, 0);
    const peakCell = cells.reduce<HotspotCell | null>(
      (peak, cell) => (peak === null || cell.count > peak.count ? cell : peak),
      null,
    );
    return {
      nodeId: node.id,
      nodeName: node.name,
      kind: node.kind,
      total,
      peakHour: peakCell !== null && peakCell.count > 0 ? peakCell.hour : null,
      cells,
    };
  });

  const allCells = rows.flatMap((row) => row.cells);
  const maxCount = Math.max(0, ...allCells.map((cell) => cell.count));
  const peakCell = allCells.reduce<HotspotCell | null>(
    (peak, cell) => (peak === null || cell.count > peak.count ? cell : peak),
    null,
  );
  const peakNode =
    peakCell === null ? undefined : nodes.find((node) => node.id === peakCell.nodeId);

  return {
    window,
    rows,
    sampleSize: events.filter((event) => event.confirmedAt !== null).length,
    maxCount,
    dawnCount: allCells
      .filter((cell) => isInHours(cell.hour, DAWN_HOURS))
      .reduce((sum, cell) => sum + cell.count, 0),
    duskCount: allCells
      .filter((cell) => isInHours(cell.hour, DUSK_HOURS))
      .reduce((sum, cell) => sum + cell.count, 0),
    peak:
      peakCell !== null && peakNode !== undefined && peakCell.count > 0
        ? {
            nodeId: peakCell.nodeId,
            nodeName: peakNode.name,
            hour: peakCell.hour,
            count: peakCell.count,
          }
        : null,
  };
}

// --------------------------------------------------------- reliability KPIs

export interface ReliabilityEvent {
  id: string;
  nodeId: string;
  openedAt: string;
  confirmedAt: string | null;
  firstDeliveryAt: string | null;
}

export interface ReliabilityNode {
  id: string;
  name: string;
  createdAt: string;
}

export interface ReliabilityCardRow {
  label: string;
  value: string;
  insufficient?: boolean;
}

export interface ReliabilityCard {
  id: string;
  label: string;
  value: string;
  definition: string;
  windowLabel: string;
  sampleLabel: string;
  insufficient?: boolean;
  rows?: ReliabilityCardRow[];
}

export interface TrendPoint {
  label: string;
  fromIso: string;
  toIso: string;
  value: number | null;
  sampleSize: number;
}

export interface ReliabilityAnalyticsSnapshot {
  window: HotspotWindow;
  cards: ReliabilityCard[];
  eventTrend: TrendPoint[];
  responseTrend: TrendPoint[];
}

function secondsBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1_000;
}

function metricValue(
  metric: Metric,
  formatter: (value: number) => string,
): string {
  return metric.kind === "ok" ? formatter(metric.value) : "n < 5";
}

function metricSample(metric: Metric): string {
  return `sample n=${Math.round(metric.sampleSize)}`;
}

function metricInsufficient(metric: Metric): boolean {
  return metric.kind === "insufficient";
}

function formatSeconds(value: number): string {
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMinutes(value: number): string {
  if (value < 1) return `${value.toFixed(1)} min`;
  return `${Math.round(value)} min`;
}

function channelLabel(channel: AlertChannel): string {
  switch (channel) {
    case "siren":
      return "Siren";
    case "villager_phone":
      return "Villagers";
    case "guard_webex":
      return "Webex";
    case "control_room":
      return "Control room";
    case "blindspot_ops":
      return "Ops blind spot";
  }
}

function makeBins(window: HotspotWindow): TrendPoint[] {
  const fromMs = new Date(window.fromIso).getTime();
  const toMs = new Date(window.toIso).getTime();
  const span = Math.max(1, toMs - fromMs);
  const bucketCount =
    window.key === "1h" ? 1 : Math.max(1, Math.ceil(span / DAY_MS));
  const bucketMs = span / bucketCount;
  return Array.from({ length: bucketCount }, (_, index) => {
    const startMs = fromMs + index * bucketMs;
    const endMs = index === bucketCount - 1 ? toMs : startMs + bucketMs;
    return {
      label:
        window.key === "1h"
          ? window.label
          : new Date(startMs).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              timeZone: "Asia/Kolkata",
            }),
      fromIso: new Date(startMs).toISOString(),
      toIso: new Date(endMs).toISOString(),
      value: null,
      sampleSize: 0,
    };
  });
}

function assignToBin<T extends { at: string }>(
  bins: TrendPoint[],
  item: T,
): number {
  const atMs = new Date(item.at).getTime();
  return bins.findIndex(
    (bin) =>
      atMs >= new Date(bin.fromIso).getTime() &&
      atMs < new Date(bin.toIso).getTime(),
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function buildReliabilityAnalytics({
  window,
  nodes,
  events,
  alerts,
  responses,
  outagesByNode,
}: {
  window: HotspotWindow;
  nodes: ReliabilityNode[];
  events: ReliabilityEvent[];
  alerts: DeliverySample[];
  responses: ResponseSample[];
  outagesByNode: Record<string, OutageSample[]>;
}): ReliabilityAnalyticsSnapshot {
  const lead = leadTimeStats(events);
  const delivery = overallDeliveryRate(alerts);
  const byChannel = deliveryRateByChannel(alerts);
  const response = responseStats(events, responses);
  const uptimeRows = nodes.map((node) => {
    const metric = uptimePct(node, outagesByNode[node.id] ?? [], {
      from: window.fromIso,
      to: window.toIso,
    });
    return {
      label: node.name,
      value: metricValue(metric, formatPercent),
      insufficient: metricInsufficient(metric),
      raw: metric,
    };
  });
  const uptimeValues = uptimeRows
    .map((row) => row.raw)
    .filter((metric): metric is Extract<Metric, { kind: "ok" }> => metric.kind === "ok");
  const meanUptime =
    uptimeValues.length === 0
      ? ({ kind: "insufficient", sampleSize: 0 } satisfies Metric)
      : ({
          kind: "ok",
          value:
            uptimeValues.reduce((sum, metric) => sum + metric.value, 0) /
            uptimeValues.length,
          sampleSize: uptimeValues.length,
        } satisfies Metric);
  const outageRows = nodes.map((node) => ({
    label: node.name,
    value: formatMinutes(
      blindSpotMinutes(outagesByNode[node.id] ?? [], {
        from: window.fromIso,
        to: window.toIso,
      }),
    ),
  }));
  const totalBlindMinutes = nodes.reduce(
    (sum, node) =>
      sum +
      blindSpotMinutes(outagesByNode[node.id] ?? [], {
        from: window.fromIso,
        to: window.toIso,
      }),
    0,
  );
  const outageCount = Object.values(outagesByNode).reduce(
    (sum, rows) => sum + rows.length,
    0,
  );

  const eventTrend = makeBins(window);
  for (const event of events) {
    if (event.confirmedAt === null) continue;
    const index = assignToBin(eventTrend, { at: event.confirmedAt });
    if (index >= 0) {
      eventTrend[index].value = (eventTrend[index].value ?? 0) + 1;
      eventTrend[index].sampleSize += 1;
    }
  }

  const ackByEvent = new Map<string, string>();
  for (const row of responses) {
    if (row.action !== "acknowledged") continue;
    const current = ackByEvent.get(row.eventId);
    if (current === undefined || row.at < current) ackByEvent.set(row.eventId, row.at);
  }
  const responseTrend = makeBins(window);
  const responseValues = responseTrend.map((): number[] => []);
  for (const event of events) {
    if (event.confirmedAt === null) continue;
    const ackAt = ackByEvent.get(event.id);
    if (ackAt === undefined) continue;
    const index = assignToBin(responseTrend, { at: event.confirmedAt });
    if (index >= 0) {
      responseValues[index].push(secondsBetween(event.confirmedAt, ackAt));
    }
  }
  responseValues.forEach((values, index) => {
    responseTrend[index].sampleSize = values.length;
    responseTrend[index].value = median(values);
  });

  return {
    window,
    cards: [
      {
        id: "lead-time",
        label: "Median + p95 lead time",
        value:
          lead.p50.kind === "ok" && lead.p95.kind === "ok"
            ? `${formatSeconds(lead.p50.value)} / ${formatSeconds(lead.p95.value)}`
            : "n < 5",
        definition: "Detection opened to first delivered alert.",
        windowLabel: window.label,
        sampleLabel: metricSample(lead.p50),
        insufficient: metricInsufficient(lead.p50) || metricInsufficient(lead.p95),
        rows: [
          {
            label: "Median",
            value: metricValue(lead.p50, formatSeconds),
            insufficient: metricInsufficient(lead.p50),
          },
          {
            label: "P95",
            value: metricValue(lead.p95, formatSeconds),
            insufficient: metricInsufficient(lead.p95),
          },
        ],
      },
      {
        id: "delivery",
        label: "Delivery success by channel",
        value: metricValue(delivery, formatPercent),
        definition: "Terminal alert rows only; delivered and acked count as success.",
        windowLabel: window.label,
        sampleLabel: metricSample(delivery),
        insufficient: metricInsufficient(delivery),
        rows: ALERT_CHANNELS.map((channel) => {
          const metric = byChannel[channel] ?? { kind: "insufficient", sampleSize: 0 };
          return {
            label: channelLabel(channel),
            value: metricValue(metric, formatPercent),
            insufficient: metricInsufficient(metric),
          };
        }),
      },
      {
        id: "response",
        label: "Response time",
        value:
          response.ackSeconds.kind === "ok" && response.onSiteSeconds.kind === "ok"
            ? `${formatSeconds(response.ackSeconds.value)} ack / ${formatSeconds(response.onSiteSeconds.value)} on site`
            : "n < 5",
        definition: "Median from confirmation to first ack and first on-site mark.",
        windowLabel: window.label,
        sampleLabel: metricSample(response.ackSeconds),
        insufficient:
          metricInsufficient(response.ackSeconds) ||
          metricInsufficient(response.onSiteSeconds),
        rows: [
          {
            label: "Ack",
            value: metricValue(response.ackSeconds, formatSeconds),
            insufficient: metricInsufficient(response.ackSeconds),
          },
          {
            label: "On site",
            value: metricValue(response.onSiteSeconds, formatSeconds),
            insufficient: metricInsufficient(response.onSiteSeconds),
          },
        ],
      },
      {
        id: "uptime",
        label: "Uptime by node",
        value: metricValue(meanUptime, formatPercent),
        definition: "Observed minutes minus blind-spot outage minutes.",
        windowLabel: window.label,
        sampleLabel: `sample n=${nodes.length} nodes`,
        insufficient: metricInsufficient(meanUptime),
        rows: uptimeRows.map(({ label, value, insufficient }) => ({
          label,
          value,
          insufficient,
        })),
      },
      {
        id: "blind-spots",
        label: "Blind-spot minutes",
        value: formatMinutes(totalBlindMinutes),
        definition: "Outage overlap inside the selected window; open outages count to now.",
        windowLabel: window.label,
        sampleLabel: `sample n=${outageCount} outages`,
        rows: outageRows,
      },
    ],
    eventTrend,
    responseTrend,
  };
}

import { hotspotBuckets } from "@/domain/metrics";
import type { NodeKind } from "@/domain/types";

const DAY_MS = 24 * 60 * 60 * 1_000;

export const HOTSPOT_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export const DAWN_HOURS = [4, 5, 6, 7] as const;
export const DUSK_HOURS = [17, 18, 19, 20] as const;

export interface HotspotWindow {
  fromIso: string;
  toIso: string;
  days: number;
}

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
    days,
  };
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

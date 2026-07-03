import type { AlertChannel, AlertStatus, ResponseAction } from "./types";

/**
 * Reliability & response metrics engine — pure aggregation, no I/O.
 *
 * Honesty rule (TESTING_QA §2.7): metrics with too few samples report
 * `insufficient` — never a fake zero, never NaN. Lead time runs from
 * detection (event opened) to the FIRST successful delivery, not to "sent".
 * Uptime observes only provisioned time.
 */

export const MIN_SAMPLES = 5;

export type Metric =
  | { kind: "ok"; value: number; sampleSize: number }
  | { kind: "insufficient"; sampleSize: number };

function metric(values: number[], minSamples: number, pick: (sorted: number[]) => number): Metric {
  if (values.length < minSamples) {
    return { kind: "insufficient", sampleSize: values.length };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return { kind: "ok", value: pick(sorted), sampleSize: values.length };
}

/** Nearest-rank percentile on an ascending-sorted array. */
function percentile(sorted: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

function secondsBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000;
}

// ---------------------------------------------------------------- lead time

export interface LeadTimeSample {
  openedAt: string;
  confirmedAt: string | null;
  firstDeliveryAt: string | null;
}

export function leadTimeStats(
  events: LeadTimeSample[],
  minSamples = MIN_SAMPLES,
): { p50: Metric; p95: Metric } {
  const leads = events
    .filter((e) => e.confirmedAt !== null && e.firstDeliveryAt !== null)
    .map((e) => secondsBetween(e.openedAt, e.firstDeliveryAt as string));
  return {
    p50: metric(leads, minSamples, (s) => percentile(s, 50)),
    p95: metric(leads, minSamples, (s) => percentile(s, 95)),
  };
}

// ------------------------------------------------------------ delivery rate

export interface DeliverySample {
  channel: AlertChannel;
  status: AlertStatus;
}

const SUCCESS_STATUSES: ReadonlySet<AlertStatus> = new Set(["delivered", "acked"]);
const TERMINAL_STATUSES: ReadonlySet<AlertStatus> = new Set([
  "delivered",
  "acked",
  "failed",
]);

/** Delivery success rate (0..1) per channel, over terminal-state alerts only. */
export function deliveryRateByChannel(
  alerts: DeliverySample[],
  minSamples = MIN_SAMPLES,
): Partial<Record<AlertChannel, Metric>> {
  const byChannel = new Map<AlertChannel, { success: number; terminal: number }>();
  for (const alert of alerts) {
    const bucket = byChannel.get(alert.channel) ?? { success: 0, terminal: 0 };
    if (TERMINAL_STATUSES.has(alert.status)) {
      bucket.terminal += 1;
      if (SUCCESS_STATUSES.has(alert.status)) bucket.success += 1;
    }
    byChannel.set(alert.channel, bucket);
  }
  const rates: Partial<Record<AlertChannel, Metric>> = {};
  for (const [channel, { success, terminal }] of byChannel) {
    rates[channel] =
      terminal < minSamples
        ? { kind: "insufficient", sampleSize: terminal }
        : { kind: "ok", value: success / terminal, sampleSize: terminal };
  }
  return rates;
}

/** Delivery success rate (0..1) across every channel, terminal alerts only. */
export function overallDeliveryRate(
  alerts: DeliverySample[],
  minSamples = MIN_SAMPLES,
): Metric {
  let success = 0;
  let terminal = 0;
  for (const alert of alerts) {
    if (!TERMINAL_STATUSES.has(alert.status)) continue;
    terminal += 1;
    if (SUCCESS_STATUSES.has(alert.status)) success += 1;
  }
  if (terminal < minSamples) {
    return { kind: "insufficient", sampleSize: terminal };
  }
  return { kind: "ok", value: success / terminal, sampleSize: terminal };
}

// ----------------------------------------------------------- response times

export interface ResponseSample {
  eventId: string;
  action: ResponseAction;
  at: string;
}

export function responseStats(
  events: { id: string; confirmedAt: string | null }[],
  responses: ResponseSample[],
  minSamples = MIN_SAMPLES,
): { ackSeconds: Metric; onSiteSeconds: Metric } {
  const firstOf = (eventId: string, action: ResponseAction): string | null => {
    let earliest: string | null = null;
    for (const r of responses) {
      if (r.eventId !== eventId || r.action !== action) continue;
      if (earliest === null || r.at < earliest) earliest = r.at;
    }
    return earliest;
  };

  const ackTimes: number[] = [];
  const onSiteTimes: number[] = [];
  for (const event of events) {
    if (event.confirmedAt === null) continue;
    const ackAt = firstOf(event.id, "acknowledged");
    if (ackAt !== null) ackTimes.push(secondsBetween(event.confirmedAt, ackAt));
    const onSiteAt = firstOf(event.id, "on_site");
    if (onSiteAt !== null) onSiteTimes.push(secondsBetween(event.confirmedAt, onSiteAt));
  }
  return {
    ackSeconds: metric(ackTimes, minSamples, (s) => percentile(s, 50)),
    onSiteSeconds: metric(onSiteTimes, minSamples, (s) => percentile(s, 50)),
  };
}

// --------------------------------------------------- uptime and blind spots

export interface OutageSample {
  startedAt: string;
  endedAt: string | null;
}

export interface TimeWindow {
  from: string;
  to: string;
}

/** Blind minutes inside the window; open outages count until window end. */
export function blindSpotMinutes(outages: OutageSample[], window: TimeWindow): number {
  const fromMs = new Date(window.from).getTime();
  const toMs = new Date(window.to).getTime();
  let blindMs = 0;
  for (const outage of outages) {
    const start = Math.max(new Date(outage.startedAt).getTime(), fromMs);
    const end = Math.min(
      outage.endedAt === null ? toMs : new Date(outage.endedAt).getTime(),
      toMs,
    );
    blindMs += Math.max(0, end - start);
  }
  return blindMs / 60_000;
}

/**
 * Fraction of observed (post-provisioning) window time the node was not
 * blind. sampleSize = observed minutes.
 */
export function uptimePct(
  node: { createdAt: string },
  outages: OutageSample[],
  window: TimeWindow,
): Metric {
  const fromMs = Math.max(
    new Date(window.from).getTime(),
    new Date(node.createdAt).getTime(),
  );
  const toMs = new Date(window.to).getTime();
  if (fromMs >= toMs) return { kind: "insufficient", sampleSize: 0 };

  const observedMin = (toMs - fromMs) / 60_000;
  const blindMin = blindSpotMinutes(outages, {
    from: new Date(fromMs).toISOString(),
    to: window.to,
  });
  return {
    kind: "ok",
    value: (observedMin - blindMin) / observedMin,
    sampleSize: observedMin,
  };
}

// ------------------------------------------------------------------ hotspots

const IST_OFFSET_MINUTES = 330; // UTC+05:30, no DST

export function istHourOfDay(iso: string): number {
  return new Date(
    new Date(iso).getTime() + IST_OFFSET_MINUTES * 60_000,
  ).getUTCHours();
}

export interface HotspotBucket {
  nodeId: string;
  /** IST hour of day, 0–23. */
  hour: number;
  count: number;
}

/** Confirmed-event counts per node × IST hour of day. */
export function hotspotBuckets(
  events: { nodeId: string; confirmedAt: string | null }[],
): HotspotBucket[] {
  const counts = new Map<string, HotspotBucket>();
  for (const event of events) {
    if (event.confirmedAt === null) continue;
    const hour = istHourOfDay(event.confirmedAt);
    const key = `${event.nodeId}:${hour}`;
    const bucket = counts.get(key) ?? { nodeId: event.nodeId, hour, count: 0 };
    bucket.count += 1;
    counts.set(key, bucket);
  }
  return [...counts.values()];
}

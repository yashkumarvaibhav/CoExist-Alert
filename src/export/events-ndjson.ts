import type { Alert, AlertChannel, EventResponse, EventState, IncursionEvent } from "@/domain/types";

/**
 * Splunk-style flattened export record for one incursion event. Keys are
 * snake_case and stable so a downstream HTTP Event Collector / forwarder can
 * index them directly. All timings are whole seconds.
 */
export interface EventExportRecord {
  event_id: string;
  node_id: string;
  state: EventState;
  species_label: string | null;
  confirmed: boolean;
  opened_at: string;
  confirmed_at: string | null;
  first_delivery_at: string | null;
  resolved_at: string | null;
  /** Detection (opened) → first delivered warning. */
  lead_time_seconds: number | null;
  /** Confirmation → first responder acknowledgement. */
  acknowledge_seconds: number | null;
  /** Confirmation → resolution. */
  resolution_seconds: number | null;
  max_tier: number | null;
  channels: AlertChannel[];
  alerts_total: number;
  alerts_delivered: number;
  alerts_failed: number;
  responses_count: number;
  /** True when a real Webex send happened for this event. */
  live_webex: boolean;
}

/** Whole seconds between two ISO timestamps, or null if either is missing. */
function secondsBetween(fromIso: string | null, toIso: string | null): number | null {
  if (fromIso === null || toIso === null) {
    return null;
  }
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000);
}

/** A dispatch counts as delivered if the channel accepted or the target acked it. */
const DELIVERED_STATUSES: ReadonlySet<Alert["status"]> = new Set(["delivered", "acked"]);

export function toEventExportRecord(
  event: IncursionEvent,
  alerts: Alert[],
  responses: EventResponse[],
): EventExportRecord {
  const channels = [...new Set(alerts.map((alert) => alert.channel))].sort();
  const firstAck = responses.find((response) => response.action === "acknowledged") ?? null;

  return {
    event_id: event.id,
    node_id: event.nodeId,
    state: event.state,
    species_label: event.speciesLabel,
    confirmed: event.confirmedAt !== null,
    opened_at: event.openedAt,
    confirmed_at: event.confirmedAt,
    first_delivery_at: event.firstDeliveryAt,
    resolved_at: event.resolvedAt,
    lead_time_seconds: secondsBetween(event.openedAt, event.firstDeliveryAt),
    acknowledge_seconds: secondsBetween(event.confirmedAt, firstAck?.at ?? null),
    resolution_seconds: secondsBetween(event.confirmedAt, event.resolvedAt),
    max_tier: alerts.length === 0 ? null : Math.max(...alerts.map((alert) => alert.tier)),
    channels,
    alerts_total: alerts.length,
    alerts_delivered: alerts.filter((alert) => DELIVERED_STATUSES.has(alert.status)).length,
    alerts_failed: alerts.filter((alert) => alert.status === "failed").length,
    responses_count: responses.length,
    live_webex: alerts.some((alert) => alert.isLive),
  };
}

/** Serialize records as newline-delimited JSON (one object per line). */
export function eventsToNdjson(records: EventExportRecord[]): string {
  return records.map((record) => `${JSON.stringify(record)}\n`).join("");
}

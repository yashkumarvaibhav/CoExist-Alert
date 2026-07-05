import { getRuntimeRepositories } from "@/db/runtime";
import type { Alert, EventResponse } from "@/domain/types";
import { eventsToNdjson, toEventExportRecord } from "@/export/events-ndjson";

export const dynamic = "force-dynamic";

/**
 * Splunk-style export of the incursion-event log as newline-delimited JSON.
 * One flattened, machine-indexable record per event — the format a Splunk HTTP
 * Event Collector or forwarder ingests directly. The payload is the simulated
 * field log (see the honesty header); every field is derived from persisted
 * event, delivery and response rows.
 */
export function GET(): Response {
  const repos = getRuntimeRepositories();
  const events = repos.events.list();

  const alertsByEvent = new Map<string, Alert[]>();
  for (const alert of repos.alerts.listAll()) {
    if (alert.eventId === null) {
      continue;
    }
    const bucket = alertsByEvent.get(alert.eventId);
    if (bucket === undefined) {
      alertsByEvent.set(alert.eventId, [alert]);
    } else {
      bucket.push(alert);
    }
  }

  const responsesByEvent = new Map<string, EventResponse[]>();
  for (const response of repos.responses.listAll()) {
    const bucket = responsesByEvent.get(response.eventId);
    if (bucket === undefined) {
      responsesByEvent.set(response.eventId, [response]);
    } else {
      bucket.push(response);
    }
  }

  const records = events.map((event) =>
    toEventExportRecord(
      event,
      alertsByEvent.get(event.id) ?? [],
      responsesByEvent.get(event.id) ?? [],
    ),
  );

  return new Response(eventsToNdjson(records), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'attachment; filename="coexist-events.ndjson"',
      "Cache-Control": "no-store",
      "X-Coexist-Export": "simulated-field-log",
    },
  });
}

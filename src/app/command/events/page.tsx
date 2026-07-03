import type { Metadata } from "next";
import Link from "next/link";

import { StatusChip } from "@/components/status-chip";
import { getRuntimeRepositories } from "@/db/runtime";
import type { EventState, IncursionEvent, SensorNode } from "@/domain/types";
import { formatElapsed, formatIstDateTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Events log — CoExist Alert",
};

const PAGE_SIZE = 12;
const IST_OFFSET_MS = 330 * 60 * 1000;

const EVENT_STATES: EventState[] = [
  "unconfirmed",
  "confirmed",
  "responding",
  "resolved",
  "expired",
];

const STATE_LABELS: Record<EventState, string> = {
  unconfirmed: "Unconfirmed",
  confirmed: "Confirmed",
  responding: "Responding",
  resolved: "Resolved",
  expired: "Expired",
};

interface EventLogSearch {
  nodeId?: string;
  state?: EventState;
  from?: string;
  to?: string;
  page: number;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isDateInput(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseSearchParams(
  params: Record<string, string | string[] | undefined>,
  nodes: SensorNode[],
): EventLogSearch {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeId = firstValue(params.nodeId);
  const state = firstValue(params.state);
  const pageValue = Number(firstValue(params.page) ?? "1");
  return {
    nodeId: nodeId !== undefined && nodeIds.has(nodeId) ? nodeId : undefined,
    state: EVENT_STATES.includes(state as EventState)
      ? (state as EventState)
      : undefined,
    from: isDateInput(firstValue(params.from)) ? firstValue(params.from) : undefined,
    to: isDateInput(firstValue(params.to)) ? firstValue(params.to) : undefined,
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };
}

function dateInputToIso(value: string, endExclusive = false): string {
  const [year, month, day] = value.split("-").map(Number);
  const istMidnight = Date.UTC(year, month - 1, day);
  const utcMs = istMidnight - IST_OFFSET_MS + (endExclusive ? 24 * 60 * 60 * 1000 : 0);
  return new Date(utcMs).toISOString();
}

function buildHref(filters: EventLogSearch, page: number): string {
  const params = new URLSearchParams();
  if (filters.nodeId !== undefined) params.set("nodeId", filters.nodeId);
  if (filters.state !== undefined) params.set("state", filters.state);
  if (filters.from !== undefined) params.set("from", filters.from);
  if (filters.to !== undefined) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query === "" ? "/command/events" : `/command/events?${query}`;
}

function secondsBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1_000;
}

function leadTime(event: IncursionEvent): string {
  if (event.firstDeliveryAt === null) {
    return event.state === "expired" ? "No alert sent" : "Pending";
  }
  return formatElapsed(secondsBetween(event.openedAt, event.firstDeliveryAt));
}

function speciesLabel(event: IncursionEvent): string {
  return event.speciesLabel?.replace(/_/g, "-") ?? "—";
}

function tierSummary(tiers: number[]): string {
  const unique = [...new Set(tiers)].sort((a, b) => a - b);
  if (unique.length === 0) return "—";
  return unique.length === 1 ? `Tier ${unique[0]}` : `Tiers ${unique.join(", ")}`;
}

function responseTime(
  event: IncursionEvent,
  responses: ReturnType<ReturnType<typeof getRuntimeRepositories>["responses"]["listForEvent"]>,
): string {
  if (event.confirmedAt === null) return event.state === "expired" ? "Suppressed" : "—";
  const ack = responses.find((response) => response.action === "acknowledged");
  if (ack === undefined) return "Awaiting ack";
  return `+${formatElapsed(secondsBetween(event.confirmedAt, ack.at))}`;
}

export default async function EventsLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const repos = getRuntimeRepositories();
  const nodes = repos.nodes.list();
  const filters = parseSearchParams(await searchParams, nodes);
  const page = filters.page;
  const result = repos.events.listFiltered({
    nodeId: filters.nodeId,
    state: filters.state,
    fromIso: filters.from === undefined ? undefined : dateInputToIso(filters.from),
    toIso: filters.to === undefined ? undefined : dateInputToIso(filters.to, true),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const nodeNames = new Map(nodes.map((node) => [node.id, node.name]));
  const rowMeta = new Map(
    result.items.map((event) => {
      const alerts = repos.alerts.listForEvent(event.id);
      const responses = repos.responses.listForEvent(event.id);
      return [
        event.id,
        {
          tiers: tierSummary(alerts.map((alert) => alert.tier)),
          responseTime: responseTime(event, responses),
        },
      ];
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Events log</h1>
        <p className="mt-1 text-sm text-muted">
          Filterable incursion record with lead-time, cascade and response proof.
        </p>
      </header>

      <form
        action="/command/events"
        className="grid gap-3 rounded-lg border border-line bg-raised px-4 py-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto_auto] lg:items-end"
      >
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.08em] text-faint">
          Node
          <select
            name="nodeId"
            defaultValue={filters.nodeId ?? ""}
            className="min-h-11 rounded-md border border-line bg-page px-3 text-sm normal-case tracking-normal text-ink"
          >
            <option value="">All nodes</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.08em] text-faint">
          State
          <select
            name="state"
            defaultValue={filters.state ?? ""}
            className="min-h-11 rounded-md border border-line bg-page px-3 text-sm normal-case tracking-normal text-ink"
          >
            <option value="">All states</option>
            {EVENT_STATES.map((state) => (
              <option key={state} value={state}>
                {STATE_LABELS[state]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.08em] text-faint">
          From
          <input
            name="from"
            type="date"
            defaultValue={filters.from ?? ""}
            className="min-h-11 rounded-md border border-line bg-page px-3 text-sm normal-case tracking-normal text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.08em] text-faint">
          To
          <input
            name="to"
            type="date"
            defaultValue={filters.to ?? ""}
            className="min-h-11 rounded-md border border-line bg-page px-3 text-sm normal-case tracking-normal text-ink"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
        >
          Apply
        </button>
        <Link
          href="/command/events"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-sm font-medium text-ink hover:bg-hover"
        >
          Clear
        </Link>
      </form>

      {result.items.length === 0 ? (
        <section className="rounded-lg border border-line bg-raised px-4 py-10 text-center text-sm text-muted">
          No events in this window.
        </section>
      ) : (
        <section className="min-w-0 overflow-x-auto rounded-lg border border-line bg-raised">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 bg-raised">
              <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-faint">
                <th scope="col" className="px-4 py-3 font-medium">
                  Opened
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Node
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Species label
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  State
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Lead time
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Tiers used
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Response time
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Resolved
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Timeline
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.items.map((event) => {
                const meta = rowMeta.get(event.id);
                return (
                  <tr key={event.id} className="hover:bg-hover">
                    <td className="tnum px-4 py-2.5 text-body">
                      {formatIstDateTime(event.openedAt)} IST
                    </td>
                    <td className="px-4 py-2.5 text-ink">
                      {nodeNames.get(event.nodeId) ?? event.nodeId}
                    </td>
                    <td className="px-4 py-2.5 text-body">
                      {speciesLabel(event)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusChip status={event.state} />
                    </td>
                    <td className="tnum px-4 py-2.5 text-body">
                      {leadTime(event)}
                    </td>
                    <td className="px-4 py-2.5 text-body">
                      {meta?.tiers ?? "—"}
                    </td>
                    <td className="tnum px-4 py-2.5 text-body">
                      {meta?.responseTime ?? "—"}
                    </td>
                    <td className="tnum px-4 py-2.5 text-body">
                      {event.resolvedAt === null
                        ? "—"
                        : `${formatIstDateTime(event.resolvedAt)} IST`}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/command/events/${event.id}`}
                        className="font-medium text-accent hover:text-accent-hover"
                      >
                        Open timeline
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <nav
        aria-label="Event pages"
        className="flex flex-wrap items-center justify-between gap-3 text-sm"
      >
        <span className="text-muted">
          Page <span className="tnum">{clampedPage}</span> of{" "}
          <span className="tnum">{totalPages}</span> ·{" "}
          <span className="tnum">{result.total}</span> events
        </span>
        <span className="flex gap-2">
          {clampedPage > 1 ? (
            <Link
              href={buildHref(filters, clampedPage - 1)}
              className="inline-flex min-h-11 items-center rounded-md border border-line px-3 font-medium text-ink hover:bg-hover"
            >
              Previous
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-faint">
              Previous
            </span>
          )}
          {clampedPage < totalPages ? (
            <Link
              href={buildHref(filters, clampedPage + 1)}
              className="inline-flex min-h-11 items-center rounded-md border border-line px-3 font-medium text-ink hover:bg-hover"
            >
              Next
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-faint">
              Next
            </span>
          )}
        </span>
      </nav>
    </div>
  );
}

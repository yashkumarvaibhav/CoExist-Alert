import type { Metadata } from "next";

import { StatusChip } from "@/components/status-chip";
import { getRuntimeRepositories } from "@/db/runtime";
import { formatIstDateTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Events log — CoExist Alert",
};

const RECENT_LIMIT = 25;

export default function EventsLogPage() {
  const repos = getRuntimeRepositories();
  const nodeNames = new Map(
    repos.nodes.list().map((node) => [node.id, node.name]),
  );
  const recent = repos.events.list().slice(-RECENT_LIMIT).reverse();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Events log</h1>
        <p className="mt-1 text-sm text-muted">
          The {RECENT_LIMIT} most recent incursion events across the corridor —
          filters and full history views follow.
        </p>
      </header>

      {recent.length === 0 ? (
        <section className="rounded-lg border border-line bg-raised px-4 py-10 text-center text-sm text-muted">
          No events in this window.
        </section>
      ) : (
        <section className="overflow-x-auto rounded-lg border border-line bg-raised">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-faint">
                <th scope="col" className="px-4 py-3 font-medium">
                  Opened (IST)
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Node
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Label
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  State
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.map((event) => (
                <tr key={event.id}>
                  <td className="tnum px-4 py-2.5 text-body">
                    {formatIstDateTime(event.openedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-ink">
                    {nodeNames.get(event.nodeId) ?? event.nodeId}
                  </td>
                  <td className="px-4 py-2.5 text-body">
                    {event.speciesLabel ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusChip status={event.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

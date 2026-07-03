import { CommandShell } from "@/components/command/command-shell";
import { getRuntimeRepositories } from "@/db/runtime";
import { buildSearchItems } from "@/lib/search";

// Live console — every command route reads current field state per request.
export const dynamic = "force-dynamic";

// Recent events surfaced in the search palette (reuses the S4 filter query).
const SEARCH_EVENT_LIMIT = 50;

export default function CommandLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const repos = getRuntimeRepositories();

  const fullNodes = repos.nodes.list();
  const nodes = fullNodes.map(({ id, name, kind }) => ({ id, name, kind }));
  const nodeNames = Object.fromEntries(fullNodes.map((n) => [n.id, n.name]));

  const searchItems = buildSearchItems({
    nodes,
    events: repos.events.listFiltered({ limit: SEARCH_EVENT_LIMIT, offset: 0 }).items,
    zones: repos.villagerZones.list(),
    responders: repos.responders.list(),
    nodeNames,
  });

  // Seed the warning alarm with events already open at load — the SSE stream
  // sends no snapshot on connect, so a confirmed event must sound immediately.
  const alarmEvents = repos.events
    .listOpen()
    .map(({ id, state, nodeId }) => ({ id, state, nodeId }));

  return (
    <CommandShell nodes={nodes} searchItems={searchItems} alarmEvents={alarmEvents}>
      {children}
    </CommandShell>
  );
}

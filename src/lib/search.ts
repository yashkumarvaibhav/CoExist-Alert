import type {
  IncursionEvent,
  Responder,
  SensorNode,
  VillagerZone,
} from "@/domain/types";
import type { UserRole } from "@/auth/session";

/**
 * Global search palette index. Command surface only. The index is a snapshot
 * built per request on the server (nodes/events/zones/responders) merged with
 * the static Screens list; filtering happens client-side over this small set.
 */

export const SEARCH_GROUPS = [
  "Screens",
  "Nodes",
  "Events",
  "Zones",
  "Responders",
] as const;

export type SearchGroup = (typeof SEARCH_GROUPS)[number];

export interface SearchItem {
  /** Stable unique id (also the listbox option id suffix). */
  id: string;
  group: SearchGroup;
  label: string;
  /** Secondary line (kind, state, role…). */
  hint?: string;
  /** Navigation target; omitted for informational rows (zones, responders). */
  href?: string;
  /** Roles allowed to see and navigate this result; omitted means all roles. */
  roles?: readonly UserRole[];
  /** Lowercased haystack for matching. */
  keywords: string;
}

export interface SearchGroupResult {
  group: SearchGroup;
  items: SearchItem[];
}

/** Static app destinations — always searchable, shown alone on an empty query. */
export const SCREEN_ITEMS: SearchItem[] = [
  {
    id: "screen-command",
    group: "Screens",
    label: "Command dashboard",
    hint: "Live map, KPIs and cascade status",
    href: "/command",
    roles: ["command", "admin"],
    keywords: "command dashboard home map kpi live",
  },
  {
    id: "screen-events",
    group: "Screens",
    label: "Events log",
    hint: "Filterable incursion history",
    href: "/command/events",
    roles: ["command", "admin"],
    keywords: "events log history incursions timeline",
  },
  {
    id: "screen-analytics",
    group: "Screens",
    label: "Analytics & hotspots",
    hint: "Hotspot heatmap and reliability KPIs",
    href: "/command/analytics",
    roles: ["command", "admin"],
    keywords: "analytics hotspots heatmap reliability kpi trends",
  },
  {
    id: "screen-guard",
    group: "Screens",
    label: "Guard view",
    hint: "Mobile response console",
    href: "/guard",
    roles: ["guard", "command", "admin"],
    keywords: "guard responder mobile acknowledge patrol",
  },
  {
    id: "screen-channels",
    group: "Screens",
    label: "Channels view",
    hint: "Villager phones and rail control",
    href: "/channels",
    roles: ["control", "command", "admin"],
    keywords: "channels villager phone rail control targeting hamlet",
  },
  {
    id: "screen-demo",
    group: "Screens",
    label: "Demo controls",
    hint: "Drive the simulated field",
    href: "/demo",
    roles: ["admin"],
    keywords: "demo controls simulate scenario preset reset",
  },
];

export function searchItemsForRole(
  items: readonly SearchItem[],
  role: UserRole,
): SearchItem[] {
  return items.filter((item) => item.roles === undefined || item.roles.includes(role));
}

export function screenItemsForRole(role: UserRole): SearchItem[] {
  return searchItemsForRole(SCREEN_ITEMS, role);
}

function prettify(token: string): string {
  return token
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function speciesLabel(label: string | null): string {
  if (label === null) return "Large animal";
  const dashed = label.replace(/_/g, "-");
  return dashed.charAt(0).toUpperCase() + dashed.slice(1);
}

/**
 * Build the dynamic (data-backed) portion of the index. Pure — takes plain
 * domain records so it is testable without a database. `nodeNames` maps a node
 * id to its display name for event rows.
 */
export function buildSearchItems({
  nodes,
  events,
  zones,
  responders,
  nodeNames,
}: {
  nodes: Pick<SensorNode, "id" | "name" | "kind">[];
  events: Pick<IncursionEvent, "id" | "nodeId" | "state" | "speciesLabel" | "openedAt">[];
  zones: Pick<VillagerZone, "id" | "label">[];
  responders: Pick<Responder, "id" | "name" | "role" | "tier">[];
  nodeNames: Record<string, string>;
}): SearchItem[] {
  const nodeItems: SearchItem[] = nodes.map((node) => ({
    id: `node-${node.id}`,
    group: "Nodes",
    label: node.name,
    hint: prettify(node.kind),
    href: `/command/nodes/${node.id}`,
    keywords: `${node.name} ${node.kind.replace(/_/g, " ")} ${node.id}`.toLowerCase(),
  }));

  const eventItems: SearchItem[] = events.map((event) => {
    const species = speciesLabel(event.speciesLabel);
    const nodeName = nodeNames[event.nodeId] ?? event.nodeId;
    return {
      id: `event-${event.id}`,
      group: "Events",
      label: `${species} · ${nodeName}`,
      hint: prettify(event.state),
      href: `/command/events/${event.id}`,
      keywords: `${species} ${event.state} ${nodeName}`.toLowerCase(),
    };
  });

  const zoneItems: SearchItem[] = zones.map((zone) => ({
    id: `zone-${zone.id}`,
    group: "Zones",
    label: zone.label,
    hint: "Hamlet zone",
    keywords: `${zone.label} hamlet zone villager`.toLowerCase(),
  }));

  const responderItems: SearchItem[] = responders.map((responder) => ({
    id: `responder-${responder.id}`,
    group: "Responders",
    label: responder.name,
    hint: `${prettify(responder.role)} · Tier ${responder.tier}`,
    keywords: `${responder.name} ${responder.role.replace(/_/g, " ")} responder`.toLowerCase(),
  }));

  return [...nodeItems, ...eventItems, ...zoneItems, ...responderItems];
}

const GROUP_INDEX: Record<SearchGroup, number> = {
  Screens: 0,
  Nodes: 1,
  Events: 2,
  Zones: 3,
  Responders: 4,
};

/**
 * Filter the index for a query, grouped in canonical order. An empty query
 * returns only the Screens group (the palette's resting state). Matching is
 * case-insensitive and requires every whitespace token to appear; within a
 * group, label-prefix matches sort ahead of mere substring matches.
 */
export function filterSearchItems(
  items: SearchItem[],
  query: string,
): SearchGroupResult[] {
  const trimmed = query.trim().toLowerCase();

  let matched: SearchItem[];
  if (trimmed === "") {
    matched = items.filter((item) => item.group === "Screens");
  } else {
    const tokens = trimmed.split(/\s+/);
    matched = items.filter((item) =>
      tokens.every((token) => item.keywords.includes(token)),
    );
  }

  const byGroup = new Map<SearchGroup, SearchItem[]>();
  for (const item of matched) {
    const bucket = byGroup.get(item.group);
    if (bucket) bucket.push(item);
    else byGroup.set(item.group, [item]);
  }

  const results: SearchGroupResult[] = [];
  for (const group of SEARCH_GROUPS) {
    const bucket = byGroup.get(group);
    if (bucket === undefined || bucket.length === 0) continue;
    if (trimmed !== "") {
      bucket.sort((a, b) => {
        const aPrefix = a.label.toLowerCase().startsWith(trimmed) ? 0 : 1;
        const bPrefix = b.label.toLowerCase().startsWith(trimmed) ? 0 : 1;
        return aPrefix - bPrefix;
      });
    }
    results.push({ group, items: bucket });
  }

  results.sort((a, b) => GROUP_INDEX[a.group] - GROUP_INDEX[b.group]);
  return results;
}

/** Flatten grouped results into the keyboard navigation order. */
export function flattenResults(results: SearchGroupResult[]): SearchItem[] {
  return results.flatMap((result) => result.items);
}

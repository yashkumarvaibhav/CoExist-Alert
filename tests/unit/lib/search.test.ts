import { describe, expect, it } from "vitest";

import {
  SCREEN_ITEMS,
  SEARCH_GROUPS,
  buildSearchItems,
  filterSearchItems,
  flattenResults,
  type SearchItem,
} from "@/lib/search";

const dynamic = buildSearchItems({
  nodes: [
    { id: "n1", name: "Village Boundary East", kind: "village_boundary" },
    { id: "n2", name: "Rail Crossing KM-47", kind: "rail_crossing" },
    { id: "n3", name: "Waterhole 7", kind: "waterhole" },
  ],
  events: [
    {
      id: "e1",
      nodeId: "n2",
      state: "confirmed",
      speciesLabel: "elephant_class",
      openedAt: "2026-07-03T00:00:00.000Z",
    },
    {
      id: "e2",
      nodeId: "n1",
      state: "expired",
      speciesLabel: null,
      openedAt: "2026-07-03T01:00:00.000Z",
    },
  ],
  zones: [{ id: "z1", label: "Chalsa Basti" }],
  responders: [
    { id: "r1", name: "Beat Officer R. Sharma", role: "guard", tier: 1 },
  ],
  nodeNames: {
    n1: "Village Boundary East",
    n2: "Rail Crossing KM-47",
    n3: "Waterhole 7",
  },
});

const index: SearchItem[] = [...SCREEN_ITEMS, ...dynamic];

describe("buildSearchItems", () => {
  it("maps nodes, events, zones and responders with hrefs where navigable", () => {
    const node = dynamic.find((i) => i.id === "node-n2");
    expect(node).toMatchObject({ group: "Nodes", label: "Rail Crossing KM-47", href: "/command/nodes/n2" });

    const event = dynamic.find((i) => i.id === "event-e1");
    expect(event).toMatchObject({
      group: "Events",
      label: "Elephant-class · Rail Crossing KM-47",
      href: "/command/events/e1",
    });

    const zone = dynamic.find((i) => i.id === "zone-z1");
    expect(zone?.href).toBeUndefined();
    const responder = dynamic.find((i) => i.id === "responder-r1");
    expect(responder?.href).toBeUndefined();
    expect(responder?.hint).toBe("Guard · Tier 1");
  });

  it("labels a null-species event as a large animal", () => {
    expect(dynamic.find((i) => i.id === "event-e2")?.label).toBe("Large animal · Village Boundary East");
  });
});

describe("filterSearchItems", () => {
  it("returns only the Screens group on an empty query", () => {
    const results = filterSearchItems(index, "");
    expect(results).toHaveLength(1);
    expect(results[0].group).toBe("Screens");
    expect(results[0].items.length).toBe(SCREEN_ITEMS.length);
  });

  it("ignores whitespace-only queries the same as empty", () => {
    expect(filterSearchItems(index, "   ")).toHaveLength(1);
  });

  it("matches a node by name fragment, case-insensitively", () => {
    const results = filterSearchItems(index, "rail");
    const nodes = results.find((r) => r.group === "Nodes");
    expect(nodes?.items.map((i) => i.label)).toContain("Rail Crossing KM-47");
    // The rail-crossing event should surface too.
    const events = results.find((r) => r.group === "Events");
    expect(events?.items[0].label).toContain("Rail Crossing KM-47");
  });

  it("requires every token to match (AND semantics)", () => {
    const results = filterSearchItems(index, "elephant confirmed");
    const events = results.find((r) => r.group === "Events");
    expect(events?.items).toHaveLength(1);
    expect(events?.items[0].id).toBe("event-e1");
    // "elephant expired" should match nothing.
    expect(filterSearchItems(index, "elephant expired")).toHaveLength(0);
  });

  it("keeps canonical group ordering", () => {
    const results = filterSearchItems(index, "a");
    const order = results.map((r) => r.group);
    const canonical = SEARCH_GROUPS.filter((g) => order.includes(g));
    expect(order).toEqual(canonical);
  });

  it("sorts label-prefix matches ahead of substring matches within a group", () => {
    const results = filterSearchItems(index, "wa");
    const nodes = results.find((r) => r.group === "Nodes");
    expect(nodes?.items[0].label).toBe("Waterhole 7");
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterSearchItems(index, "zzzznotathing")).toEqual([]);
  });
});

describe("flattenResults", () => {
  it("flattens grouped results into keyboard navigation order", () => {
    const results = filterSearchItems(index, "rail");
    const flat = flattenResults(results);
    expect(flat.length).toBeGreaterThan(0);
    // Nodes come before Events in canonical order.
    const nodeIdx = flat.findIndex((i) => i.group === "Nodes");
    const eventIdx = flat.findIndex((i) => i.group === "Events");
    expect(nodeIdx).toBeLessThan(eventIdx);
  });
});

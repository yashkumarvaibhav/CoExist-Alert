import type { NodeKind, SensorNode, SignalSource } from "@/domain/types";

import { SimulatorError } from "./errors";

/**
 * Deterministic demo scenario presets (ARCHITECTURE §5). Plans are pure data:
 * the simulator schedules the steps and dispatches them through the ingest
 * API, so a preset exercises exactly the pipeline real edge payloads would.
 */

export const SCENARIO_PRESETS = [
  "rail_crossing_confirmed",
  "weak_signal_expires",
  "village_dawn_incursion",
  "node_blindspot",
] as const;

export type ScenarioPreset = (typeof SCENARIO_PRESETS)[number];

export type ScenarioStep =
  | {
      kind: "detection";
      delayS: number;
      source: SignalSource;
      classification: string;
      confidence: number;
      snapshotRef: string | null;
    }
  | { kind: "kill_link"; delayS: number }
  | { kind: "restore_link"; delayS: number };

/** Sensor kit per node kind — corroboration always has a second source. */
export const SOURCES_BY_KIND: Record<NodeKind, readonly [SignalSource, SignalSource]> = {
  village_boundary: ["camera", "motion"],
  rail_crossing: ["camera", "thermal"],
  waterhole: ["camera", "acoustic"],
};

const DEFAULT_TARGET_KIND: Record<ScenarioPreset, NodeKind> = {
  rail_crossing_confirmed: "rail_crossing",
  weak_signal_expires: "waterhole",
  village_dawn_incursion: "village_boundary",
  node_blindspot: "waterhole",
};

const PLANS: Record<ScenarioPreset, ScenarioStep[]> = {
  // 0.62 camera sighting, thermal corroboration 4s later: neither confirms
  // alone, the cross-source rule does.
  rail_crossing_confirmed: [
    {
      kind: "detection",
      delayS: 0,
      source: "camera",
      classification: "large_animal",
      confidence: 0.62,
      snapshotRef: "/demo-snapshots/n2-camera.svg",
    },
    {
      kind: "detection",
      delayS: 4,
      source: "thermal",
      classification: "elephant_class",
      confidence: 0.78,
      snapshotRef: "/demo-snapshots/n2-thermal.svg",
    },
  ],
  // One weak signal, then silence — the confirmation window expires it:
  // suppression made visible.
  weak_signal_expires: [
    {
      kind: "detection",
      delayS: 0,
      source: "acoustic",
      classification: "movement",
      confidence: 0.38,
      snapshotRef: "/demo-snapshots/n3-waterhole.svg",
    },
  ],
  village_dawn_incursion: [
    {
      kind: "detection",
      delayS: 0,
      source: "camera",
      classification: "large_animal",
      confidence: 0.66,
      snapshotRef: "/demo-snapshots/n1-dawn-boundary.svg",
    },
    {
      kind: "detection",
      delayS: 6,
      source: "motion",
      classification: "elephant_class",
      confidence: 0.71,
      snapshotRef: null,
    },
  ],
  // Restore lands after offlineAfterMissed × heartbeatIntervalS (40s by
  // default), so the sweep provably opens the outage before recovery.
  node_blindspot: [
    { kind: "kill_link", delayS: 0 },
    { kind: "restore_link", delayS: 75 },
  ],
};

export function planScenario(preset: ScenarioPreset): ScenarioStep[] {
  return PLANS[preset].map((step) => ({ ...step }));
}

export function resolveScenarioNode(
  preset: ScenarioPreset,
  nodes: SensorNode[],
  nodeId?: string,
): SensorNode {
  if (nodes.length === 0) {
    throw new SimulatorError(
      409,
      "no_nodes",
      "No sensor nodes are provisioned; run `npm run setup` first.",
    );
  }
  if (nodeId !== undefined) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) {
      throw new SimulatorError(404, "node_not_found", `Unknown sensor node "${nodeId}".`);
    }
    return node;
  }
  return nodes.find((candidate) => candidate.kind === DEFAULT_TARGET_KIND[preset]) ?? nodes[0];
}

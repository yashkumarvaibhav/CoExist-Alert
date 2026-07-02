import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/domain/types";
import type { SensorNode } from "@/domain/types";
import { SimulatorError } from "@/sim/errors";
import {
  SCENARIO_PRESETS,
  SOURCES_BY_KIND,
  planScenario,
  resolveScenarioNode,
} from "@/sim/scenarios";

function makeNode(id: string, kind: SensorNode["kind"]): SensorNode {
  return {
    id,
    name: id,
    kind,
    lat: 26.87,
    lng: 88.85,
    geofenceRadiusM: 1_800,
    status: "healthy",
    batteryPct: 80,
    linkQualityPct: 90,
    lastHeartbeatAt: "2026-07-02T04:58:02.000Z",
    createdAt: "2026-06-02T00:00:00.000Z",
  };
}

const fieldNodes = [
  makeNode("n1", "village_boundary"),
  makeNode("n2", "rail_crossing"),
  makeNode("n3", "waterhole"),
];

describe("scenario presets", () => {
  it("exposes exactly the four demo presets", () => {
    expect([...SCENARIO_PRESETS]).toEqual([
      "rail_crossing_confirmed",
      "weak_signal_expires",
      "village_dawn_incursion",
      "node_blindspot",
    ]);
  });

  it("plans the rail crossing as a cross-source corroboration below the confirm threshold", () => {
    const steps = planScenario("rail_crossing_confirmed");

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      kind: "detection",
      delayS: 0,
      source: "camera",
      confidence: 0.62,
    });
    expect(steps[1]).toMatchObject({
      kind: "detection",
      delayS: 4,
      source: "thermal",
      classification: "elephant_class",
    });
    for (const step of steps) {
      if (step.kind !== "detection") continue;
      // Neither signal confirms alone: the corroboration rule must do it.
      expect(step.confidence).toBeLessThan(DEFAULT_SETTINGS.confirmConfidence);
    }
    expect(steps[0]).not.toMatchObject({ source: (steps[1] as { source: string }).source });
  });

  it("plans the weak signal as a single low-confidence detection", () => {
    const steps = planScenario("weak_signal_expires");

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: "detection", delayS: 0 });
    const step = steps[0];
    if (step.kind === "detection") {
      expect(step.confidence).toBeLessThan(0.5);
    }
  });

  it("plans the village dawn incursion as camera then motion corroboration", () => {
    const steps = planScenario("village_dawn_incursion");

    expect(steps.map((step) => step.kind)).toEqual(["detection", "detection"]);
    expect(steps[0]).toMatchObject({ source: "camera", delayS: 0 });
    expect(steps[1]).toMatchObject({ source: "motion", delayS: 6 });
  });

  it("plans the blindspot as kill then restore after the node is provably offline", () => {
    const steps = planScenario("node_blindspot");

    expect(steps[0]).toMatchObject({ kind: "kill_link", delayS: 0 });
    expect(steps[1]).toMatchObject({ kind: "restore_link" });
    const offlineAfterS =
      DEFAULT_SETTINGS.offlineAfterMissed * DEFAULT_SETTINGS.heartbeatIntervalS;
    expect(steps[1].delayS).toBeGreaterThan(offlineAfterS);
  });

  it("maps every node kind to a two-sensor kit for corroboration", () => {
    for (const kit of Object.values(SOURCES_BY_KIND)) {
      expect(kit).toHaveLength(2);
      expect(kit[0]).not.toBe(kit[1]);
    }
  });
});

describe("resolveScenarioNode", () => {
  it("targets the preset's natural node kind by default", () => {
    expect(resolveScenarioNode("rail_crossing_confirmed", fieldNodes).id).toBe("n2");
    expect(resolveScenarioNode("village_dawn_incursion", fieldNodes).id).toBe("n1");
    expect(resolveScenarioNode("weak_signal_expires", fieldNodes).id).toBe("n3");
    expect(resolveScenarioNode("node_blindspot", fieldNodes).id).toBe("n3");
  });

  it("honours an explicit node override", () => {
    expect(resolveScenarioNode("rail_crossing_confirmed", fieldNodes, "n1").id).toBe("n1");
  });

  it("rejects unknown node overrides with a 404", () => {
    expect(() => resolveScenarioNode("rail_crossing_confirmed", fieldNodes, "n9")).toThrowError(
      SimulatorError,
    );
    try {
      resolveScenarioNode("rail_crossing_confirmed", fieldNodes, "n9");
    } catch (error) {
      expect(error).toMatchObject({ status: 404, code: "node_not_found" });
    }
  });

  it("falls back to the first node when no node matches the preset kind", () => {
    const railOnly = [makeNode("nx", "rail_crossing")];
    expect(resolveScenarioNode("weak_signal_expires", railOnly).id).toBe("nx");
  });

  it("rejects an empty field with a 409", () => {
    try {
      resolveScenarioNode("rail_crossing_confirmed", []);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toMatchObject({ status: 409, code: "no_nodes" });
    }
  });
});

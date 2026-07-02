import { describe, expect, it } from "vitest";
import { planCascade, planEscalation } from "@/domain/cascade";
import { haversineMeters } from "@/domain/geo";
import type { Responder, SensorNode, VillagerZone } from "@/domain/types";

const T0 = "2026-07-02T04:58:31.000Z";
function plusSeconds(iso: string, secs: number): string {
  return new Date(new Date(iso).getTime() + secs * 1000).toISOString();
}

// Rail Crossing KM-47 with a 1.5 km geofence.
const railNode: SensorNode = {
  id: "n2",
  name: "Rail Crossing KM-47",
  kind: "rail_crossing",
  lat: 26.89,
  lng: 88.89,
  geofenceRadiusM: 1500,
  status: "healthy",
  batteryPct: 82,
  linkQualityPct: 91,
  lastHeartbeatAt: T0,
  createdAt: "2026-06-01T00:00:00.000Z",
};

const villageNode: SensorNode = {
  ...railNode,
  id: "n1",
  name: "Village Boundary East",
  kind: "village_boundary",
  lat: 26.87,
  lng: 88.85,
};

// ~0.009° ≈ 1 km; ~0.03° ≈ 3.3 km (outside the 1.5 km geofence).
const zones: VillagerZone[] = [
  { id: "z1", label: "Uttar Madhupur East", lat: 26.898, lng: 88.89 },
  { id: "z2", label: "Uttar Madhupur West", lat: 26.89, lng: 88.899 },
  { id: "z3", label: "Distant Hamlet", lat: 26.92, lng: 88.92 },
];

const responders: Responder[] = [
  { id: "r2", name: "Range RRT Alpha", role: "guard", tier: 2, webexEmail: null, phoneLabel: "+91 •• 22", nodeIds: ["n1", "n2"] },
  { id: "r1", name: "Beat Officer R. Sharma", role: "guard", tier: 1, webexEmail: "sharma@example.org", phoneLabel: "+91 •• 11", nodeIds: ["n1", "n2"] },
  { id: "r3", name: "Guard Other Beat", role: "guard", tier: 1, webexEmail: null, phoneLabel: "+91 •• 33", nodeIds: ["n3"] },
  { id: "rc", name: "NFR Section Control — Chalsa", role: "control_room", tier: 1, webexEmail: null, phoneLabel: "rail-desk", nodeIds: [] },
];

const confirmedEvent = { id: "evt-1", nodeId: "n2", confirmedAt: T0, speciesLabel: "elephant_class" };

describe("geofence math", () => {
  it("computes ~111 m per 0.001° of latitude", () => {
    const d = haversineMeters(26.89, 88.89, 26.891, 88.89);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });
});

describe("cascade targeting", () => {
  it("plans siren, geofenced villager phones, assigned guards and rail control", () => {
    const plan = planCascade(confirmedEvent, railNode, zones, responders);

    const siren = plan.filter((a) => a.channel === "siren");
    expect(siren).toEqual([{ channel: "siren", targetRef: "n2", tier: 1 }]);

    const villagers = plan.filter((a) => a.channel === "villager_phone");
    expect(villagers.map((a) => a.targetRef).sort()).toEqual(["z1", "z2"]);
    expect(villagers.every((a) => a.tier === 1)).toBe(true);

    const guards = plan.filter((a) => a.channel === "guard_webex");
    expect(guards).toEqual([
      { channel: "guard_webex", targetRef: "r1", tier: 1 },
      { channel: "guard_webex", targetRef: "r2", tier: 2 },
    ]);

    const control = plan.filter((a) => a.channel === "control_room");
    expect(control).toEqual([{ channel: "control_room", targetRef: "rc", tier: 1 }]);
  });

  it("excludes out-of-geofence zones and unassigned guards", () => {
    const plan = planCascade(confirmedEvent, railNode, zones, responders);
    expect(plan.some((a) => a.targetRef === "z3")).toBe(false);
    expect(plan.some((a) => a.targetRef === "r3")).toBe(false);
  });

  it("rail_crossing always includes control_room at tier 1 even for unassigned control rooms", () => {
    const plan = planCascade(confirmedEvent, railNode, zones, responders);
    const control = plan.find((a) => a.channel === "control_room");
    expect(control?.tier).toBe(1);
  });

  it("village_boundary events do not include the control room", () => {
    const plan = planCascade(
      { ...confirmedEvent, nodeId: "n1" },
      villageNode,
      zones,
      responders,
    );
    expect(plan.some((a) => a.channel === "control_room")).toBe(false);
  });

  it("is deterministic: guards ordered by tier then id", () => {
    const a = planCascade(confirmedEvent, railNode, zones, responders);
    const b = planCascade(confirmedEvent, railNode, zones, [...responders].reverse());
    expect(a).toEqual(b);
  });
});

describe("escalation logic", () => {
  const base = {
    lastDispatchAt: T0,
    highestDispatchedTier: 1 as const,
    acknowledged: false,
    settings: { escalationTimeoutS: 90 },
  };

  it("escalates to tier 2 at exactly the timeout with no ack", () => {
    const d = planEscalation({ ...base, now: plusSeconds(T0, 90) });
    expect(d).toEqual({ kind: "escalate", toTier: 2 });
  });

  it("waits (with a due time) one second before the timeout", () => {
    const d = planEscalation({ ...base, now: plusSeconds(T0, 89) });
    expect(d).toEqual({ kind: "wait", nextCheckAt: plusSeconds(T0, 90) });
  });

  it("an acknowledgement stops escalation even at the timeout", () => {
    const d = planEscalation({ ...base, acknowledged: true, now: plusSeconds(T0, 90) });
    expect(d).toEqual({ kind: "stop", reason: "acknowledged" });
  });

  it("never exceeds tier 3", () => {
    const d = planEscalation({
      ...base,
      highestDispatchedTier: 3,
      now: plusSeconds(T0, 500),
    });
    expect(d).toEqual({ kind: "stop", reason: "max_tier" });
  });

  it("after escalating, the clock restarts from the new dispatch", () => {
    const d = planEscalation({
      ...base,
      lastDispatchAt: plusSeconds(T0, 90),
      highestDispatchedTier: 2,
      now: plusSeconds(T0, 120),
    });
    expect(d).toEqual({ kind: "wait", nextCheckAt: plusSeconds(T0, 180) });
  });

  it("escalates tier 2 → 3 exactly once more", () => {
    const d = planEscalation({
      ...base,
      lastDispatchAt: plusSeconds(T0, 90),
      highestDispatchedTier: 2,
      now: plusSeconds(T0, 180),
    });
    expect(d).toEqual({ kind: "escalate", toTier: 3 });
  });
});

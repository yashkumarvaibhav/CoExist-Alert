import { getRuntimeRepositories } from "@/db/runtime";

import { FieldSimulator } from "./simulator";
import { createIngestRouteTransport } from "./transport";
import type { ScenarioPreset } from "./scenarios";

/**
 * Process-wide simulator singleton. Anchored on globalThis because Next.js
 * compiles instrumentation and route handlers into separate module graphs;
 * a module-level singleton would silently fork between them.
 */

const SIMULATOR_KEY = Symbol.for("coexist-alert.simulator");
const globalStore = globalThis as unknown as Record<symbol, unknown>;

export function envFlag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

function createDefaultSimulator(): FieldSimulator {
  return new FieldSimulator({
    reader: {
      listNodes: () => getRuntimeRepositories().nodes.list(),
      getSettings: () => getRuntimeRepositories().settings.get(),
      listOpenEvents: () => getRuntimeRepositories().events.listOpen(),
      findSignalById: (id) => getRuntimeRepositories().signals.findById(id),
    },
    transport: createIngestRouteTransport(),
    ambient: envFlag(process.env.COEXIST_SIM_AMBIENT),
  });
}

export function getOrCreateSimulator(): FieldSimulator {
  const existing = globalStore[SIMULATOR_KEY] as FieldSimulator | undefined;
  if (existing !== undefined) return existing;
  const simulator = createDefaultSimulator();
  globalStore[SIMULATOR_KEY] = simulator;
  return simulator;
}

export function peekSimulator(): FieldSimulator | null {
  return (globalStore[SIMULATOR_KEY] as FieldSimulator | undefined) ?? null;
}

export function resetSimulator(): void {
  const existing = globalStore[SIMULATOR_KEY] as FieldSimulator | undefined;
  existing?.stop();
  delete globalStore[SIMULATOR_KEY];
}

export type SimulatorHealth =
  | { status: "not_started" }
  | {
      status: "running" | "idle";
      ambient: boolean;
      killedNodeIds: string[];
      scenario: ScenarioPreset | null;
    };

export function simulatorHealth(): SimulatorHealth {
  const simulator = peekSimulator();
  if (simulator === null) return { status: "not_started" };
  const status = simulator.status();
  return {
    status: status.running ? "running" : "idle",
    ambient: status.ambient,
    killedNodeIds: status.killedNodeIds,
    scenario: status.scenario,
  };
}

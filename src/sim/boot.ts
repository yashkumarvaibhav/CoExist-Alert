import { getRuntimeRepositories } from "@/db/runtime";
import { sweepFieldState } from "@/ingest/service";
import { publishStreamEvents } from "@/stream/hub";

import { envFlag, getOrCreateSimulator } from "./runtime";

/**
 * Field runtime boot: starts the periodic state sweep (a dark node cannot
 * report its own outage, and silence must expire unconfirmed events) and the
 * simulated heartbeat loop. Called once per server process from
 * instrumentation; safe to call again.
 */

export const SWEEP_INTERVAL_MS = 5_000;

const BOOT_KEY = Symbol.for("coexist-alert.field-runtime-started");
const globalStore = globalThis as unknown as Record<symbol, unknown>;

let lastSweepError: string | null = null;

/** One safe sweep pass: evaluates health timeouts + event expiry, publishes deltas. */
export function runFieldSweep(): void {
  try {
    const outcome = sweepFieldState(getRuntimeRepositories(), new Date().toISOString());
    if (outcome.streamEvents.length > 0) {
      publishStreamEvents(outcome.streamEvents);
    }
    lastSweepError = null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastSweepError) {
      console.warn(`[field-runtime] sweep failed: ${message}`);
    }
    lastSweepError = message;
  }
}

function simulatorAutostartEnabled(): boolean {
  const value = process.env.COEXIST_SIM_AUTOSTART;
  if (value === undefined || value === "") return true;
  return envFlag(value);
}

export function startFieldRuntime(): void {
  if (globalStore[BOOT_KEY] === true) return;
  globalStore[BOOT_KEY] = true;

  // Boot catch-up: recover heartbeat-timeout state from the DB before the
  // interval takes over — downtime must surface as outages, not silence.
  runFieldSweep();
  const sweepTimer = setInterval(runFieldSweep, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();

  const simulator = getOrCreateSimulator();
  if (simulatorAutostartEnabled()) {
    simulator.start();
  }
}

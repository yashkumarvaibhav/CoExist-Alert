import { describe, expect, it } from "vitest";
import {
  applyHeartbeat,
  evaluateHealth,
  LOW_BATTERY_PCT,
  type HealthState,
} from "@/domain/health";
import { DEFAULT_SETTINGS } from "@/domain/types";

// Settings under test: beat every 10s, degraded at 2 missed, offline at 4.
const s = DEFAULT_SETTINGS;

const T0 = "2026-07-02T04:00:00.000Z";
function plusSeconds(iso: string, secs: number): string {
  return new Date(new Date(iso).getTime() + secs * 1000).toISOString();
}

function healthyState(overrides: Partial<HealthState> = {}): HealthState {
  return {
    status: "healthy",
    lastHeartbeatAt: T0,
    batteryPct: 90,
    outageOpen: false,
    ...overrides,
  };
}

function beat(atSecs: number, batteryPct = 90) {
  return { at: plusSeconds(T0, atSecs), batteryPct, linkQualityPct: 95 };
}

describe("heartbeat timeout boundaries", () => {
  it("stays healthy strictly below the degraded boundary", () => {
    const { state } = evaluateHealth(healthyState(), plusSeconds(T0, 19), s);
    expect(state.status).toBe("healthy");
  });

  it("degrades at exactly degradedAfterMissed intervals", () => {
    const { state, effects } = evaluateHealth(healthyState(), plusSeconds(T0, 20), s);
    expect(state.status).toBe("degraded");
    expect(effects.openOutage).toBe(false);
    expect(effects.fireBlindspotAlert).toBe(false);
  });

  it("stays degraded strictly below the offline boundary", () => {
    const { state } = evaluateHealth(healthyState(), plusSeconds(T0, 39), s);
    expect(state.status).toBe("degraded");
  });

  it("goes offline at exactly offlineAfterMissed intervals, opening an outage and firing blindspot ops", () => {
    const { state, effects } = evaluateHealth(healthyState(), plusSeconds(T0, 40), s);
    expect(state.status).toBe("offline");
    expect(state.outageOpen).toBe(true);
    expect(effects.openOutage).toBe(true);
    expect(effects.fireBlindspotAlert).toBe(true);
  });

  it("re-evaluating an offline node does NOT re-open the outage or re-fire the alert", () => {
    const first = evaluateHealth(healthyState(), plusSeconds(T0, 40), s);
    const second = evaluateHealth(first.state, plusSeconds(T0, 55), s);
    expect(second.state.status).toBe("offline");
    expect(second.effects.openOutage).toBe(false);
    expect(second.effects.fireBlindspotAlert).toBe(false);
  });

  it("cannot evaluate a node that has never sent a heartbeat", () => {
    const { state, effects } = evaluateHealth(
      healthyState({ lastHeartbeatAt: null }),
      plusSeconds(T0, 120),
      s,
    );
    expect(state.status).toBe("healthy");
    expect(effects.changed).toBe(false);
    expect(effects.openOutage).toBe(false);
    expect(effects.fireBlindspotAlert).toBe(false);
  });
});

describe("battery threshold", () => {
  it(`degrades on a fresh heartbeat with battery below ${LOW_BATTERY_PCT}%`, () => {
    const { state } = applyHeartbeat(healthyState(), beat(10, LOW_BATTERY_PCT - 1), s);
    expect(state.status).toBe("degraded");
  });

  it(`stays healthy at exactly ${LOW_BATTERY_PCT}%`, () => {
    const { state } = applyHeartbeat(healthyState(), beat(10, LOW_BATTERY_PCT), s);
    expect(state.status).toBe("healthy");
  });

  it("low battery degrades a node that is current on heartbeats (timeout sweep)", () => {
    const { state } = evaluateHealth(
      healthyState({ batteryPct: 15 }),
      plusSeconds(T0, 5),
      s,
    );
    expect(state.status).toBe("degraded");
  });

  it("missed-beat offline outranks the battery rule", () => {
    const { state } = evaluateHealth(
      healthyState({ batteryPct: 15 }),
      plusSeconds(T0, 40),
      s,
    );
    expect(state.status).toBe("offline");
  });
});

describe("recovery", () => {
  it("a heartbeat recovers an offline node and closes the outage without firing alerts", () => {
    const offline = evaluateHealth(healthyState(), plusSeconds(T0, 40), s);
    const { state, effects } = applyHeartbeat(offline.state, beat(41), s);
    expect(state.status).toBe("healthy");
    expect(state.outageOpen).toBe(false);
    expect(effects.closeOutage).toBe(true);
    expect(effects.fireBlindspotAlert).toBe(false);
  });

  it("a low-battery heartbeat still closes the outage but lands on degraded", () => {
    const offline = evaluateHealth(healthyState(), plusSeconds(T0, 40), s);
    const { state, effects } = applyHeartbeat(offline.state, beat(41, 10), s);
    expect(state.status).toBe("degraded");
    expect(effects.closeOutage).toBe(true);
  });

  it("a heartbeat recovers a degraded node to healthy", () => {
    const degraded = evaluateHealth(healthyState(), plusSeconds(T0, 20), s);
    const { state } = applyHeartbeat(degraded.state, beat(21), s);
    expect(state.status).toBe("healthy");
  });
});

describe("no flapping", () => {
  it("jittered heartbeats around the nominal interval never leave healthy", () => {
    // Nominal 10s beats arriving with up to ±1.5s of jitter.
    const arrivals = [10.8, 19.2, 30.5, 41.5, 50.1, 61.4];
    let state = healthyState();
    for (const at of arrivals) {
      // Timeout sweep runs just before each beat lands.
      const sweep = evaluateHealth(state, plusSeconds(T0, at - 0.1), s);
      expect(sweep.state.status).toBe("healthy");
      const applied = applyHeartbeat(sweep.state, beat(at), s);
      state = applied.state;
      expect(state.status).toBe("healthy");
    }
  });

  it("an out-of-order (older) heartbeat is ignored", () => {
    const current = healthyState({ lastHeartbeatAt: plusSeconds(T0, 30) });
    const { state, effects } = applyHeartbeat(current, beat(20), s);
    expect(state).toEqual(current);
    expect(effects.changed).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  evaluateExpiry,
  processSignal,
  type PendingEvent,
} from "@/domain/confirmation";
import { DEFAULT_SETTINGS } from "@/domain/types";

// Settings under test: 45s corroboration window, 0.85 immediate-confirm bar.
const s = DEFAULT_SETTINGS;

const T0 = "2026-07-02T04:58:02.000Z";
function plusSeconds(iso: string, secs: number): string {
  return new Date(new Date(iso).getTime() + secs * 1000).toISOString();
}

function signal(overrides: Partial<Parameters<typeof processSignal>[1]> = {}) {
  return {
    id: "sig-1",
    nodeId: "n2",
    at: T0,
    source: "camera" as const,
    classification: "large_animal",
    confidence: 0.62,
    ...overrides,
  };
}

function unconfirmedEvent(overrides: Partial<PendingEvent> = {}): PendingEvent {
  return {
    eventId: "evt-1",
    nodeId: "n2",
    openedAt: T0,
    state: "unconfirmed",
    leadSource: "camera",
    leadClassification: "large_animal",
    leadConfidence: 0.62,
    ...overrides,
  };
}

describe("immediate confirmation by confidence", () => {
  it("opens a confirmed event at exactly the confidence bar", () => {
    const d = processSignal(null, signal({ confidence: 0.85 }), s);
    expect(d.expireEventId).toBeNull();
    expect(d.decision).toEqual({
      kind: "open",
      state: "confirmed",
      speciesLabel: "large_animal",
    });
  });

  it("opens an unconfirmed event just below the bar — a single weak signal never alerts", () => {
    const d = processSignal(null, signal({ confidence: 0.8499 }), s);
    expect(d.decision).toEqual({ kind: "open", state: "unconfirmed" });
  });

  it("a high-confidence signal confirms an open event even from the same source", () => {
    const d = processSignal(
      unconfirmedEvent(),
      signal({ id: "sig-2", at: plusSeconds(T0, 20), source: "camera", confidence: 0.93, classification: "elephant_class" }),
      s,
    );
    expect(d.decision).toEqual({
      kind: "confirm",
      eventId: "evt-1",
      speciesLabel: "elephant_class",
    });
  });
});

describe("two-signal cross-source corroboration", () => {
  it("a different-source signal inside the window confirms", () => {
    const d = processSignal(
      unconfirmedEvent(),
      signal({ id: "sig-2", at: plusSeconds(T0, 29), source: "thermal", confidence: 0.7, classification: "elephant_class" }),
      s,
    );
    expect(d.decision).toEqual({
      kind: "confirm",
      eventId: "evt-1",
      speciesLabel: "elephant_class",
    });
  });

  it("confirms at exactly the window edge", () => {
    const d = processSignal(
      unconfirmedEvent(),
      signal({ id: "sig-2", at: plusSeconds(T0, 45), source: "thermal", confidence: 0.7 }),
      s,
    );
    expect(d.decision.kind).toBe("confirm");
  });

  it("a same-source signal attaches as evidence but does NOT confirm", () => {
    const d = processSignal(
      unconfirmedEvent(),
      signal({ id: "sig-2", at: plusSeconds(T0, 20), source: "camera", confidence: 0.7 }),
      s,
    );
    expect(d.decision).toEqual({ kind: "attach", eventId: "evt-1" });
  });

  it("a same-source evidence signal does not restart the window", () => {
    // Same-source at +20s, then different-source at +50s: window still counts
    // from the event's openedAt, so the late corroboration must not confirm.
    const first = processSignal(
      unconfirmedEvent(),
      signal({ id: "sig-2", at: plusSeconds(T0, 20), source: "camera", confidence: 0.7 }),
      s,
    );
    expect(first.decision.kind).toBe("attach");
    const late = processSignal(
      unconfirmedEvent(),
      signal({ id: "sig-3", at: plusSeconds(T0, 50), source: "thermal", confidence: 0.7 }),
      s,
    );
    expect(late.decision.kind).not.toBe("confirm");
  });

  it("a late different-source signal expires the stale event and opens a fresh one", () => {
    const d = processSignal(
      unconfirmedEvent(),
      signal({ id: "sig-2", at: plusSeconds(T0, 45.001), source: "thermal", confidence: 0.7 }),
      s,
    );
    expect(d.expireEventId).toBe("evt-1");
    expect(d.decision).toEqual({ kind: "open", state: "unconfirmed" });
  });
});

describe("already-confirmed events", () => {
  it("further signals attach as evidence — one incursion, one cascade", () => {
    const d = processSignal(
      unconfirmedEvent({ state: "confirmed" }),
      signal({ id: "sig-3", at: plusSeconds(T0, 60), source: "thermal", confidence: 0.9 }),
      s,
    );
    expect(d.decision).toEqual({ kind: "attach", eventId: "evt-1" });
    expect(d.expireEventId).toBeNull();
  });
});

describe("window expiry", () => {
  it("does not expire inside the window", () => {
    expect(evaluateExpiry(unconfirmedEvent(), plusSeconds(T0, 44), s)).toBe(false);
  });

  it("does not expire at exactly the window edge (a signal landing there may still confirm)", () => {
    expect(evaluateExpiry(unconfirmedEvent(), plusSeconds(T0, 45), s)).toBe(false);
  });

  it("expires strictly past the window", () => {
    expect(evaluateExpiry(unconfirmedEvent(), plusSeconds(T0, 45.001), s)).toBe(true);
  });

  it("never expires a confirmed event", () => {
    expect(
      evaluateExpiry(unconfirmedEvent({ state: "confirmed" }), plusSeconds(T0, 300), s),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { deriveResponseProgress, RESPONSE_STEPS } from "@/lib/response-steps";
import type { ResponseAction } from "@/domain/types";

function response(action: ResponseAction, at: string) {
  return { action, at };
}

describe("deriveResponseProgress", () => {
  it("declares the four steps in field order", () => {
    expect(RESPONSE_STEPS).toEqual([
      "acknowledged",
      "en_route",
      "on_site",
      "resolved",
    ]);
  });

  it("starts with acknowledge next and nothing completed", () => {
    const progress = deriveResponseProgress([]);
    expect(progress.completedAt).toEqual({});
    expect(progress.nextAction).toBe("acknowledged");
    expect(progress.done).toBe(false);
  });

  it("records the timestamp of each completed step and advances", () => {
    const progress = deriveResponseProgress([
      response("acknowledged", "2026-07-03T05:00:10.000Z"),
      response("en_route", "2026-07-03T05:01:00.000Z"),
    ]);
    expect(progress.completedAt).toEqual({
      acknowledged: "2026-07-03T05:00:10.000Z",
      en_route: "2026-07-03T05:01:00.000Z",
    });
    expect(progress.nextAction).toBe("on_site");
    expect(progress.done).toBe(false);
  });

  it("keeps the FIRST timestamp when an action repeats", () => {
    const progress = deriveResponseProgress([
      response("acknowledged", "2026-07-03T05:00:10.000Z"),
      response("acknowledged", "2026-07-03T05:02:00.000Z"),
    ]);
    expect(progress.completedAt.acknowledged).toBe("2026-07-03T05:00:10.000Z");
  });

  it("is order-independent — a late-arriving earlier action still lands", () => {
    const progress = deriveResponseProgress([
      response("en_route", "2026-07-03T05:01:00.000Z"),
      response("acknowledged", "2026-07-03T05:00:10.000Z"),
    ]);
    expect(progress.completedAt.acknowledged).toBe("2026-07-03T05:00:10.000Z");
    expect(progress.nextAction).toBe("on_site");
  });

  it("treats a skipped-ahead action as covering earlier steps for advancement", () => {
    // A responder may resolve directly (e.g. false alarm cleared on site);
    // the next action is whatever follows the furthest completed step.
    const progress = deriveResponseProgress([
      response("on_site", "2026-07-03T05:03:00.000Z"),
    ]);
    expect(progress.nextAction).toBe("resolved");
    expect(progress.done).toBe(false);
  });

  it("is done after resolved with no next action", () => {
    const progress = deriveResponseProgress([
      response("acknowledged", "2026-07-03T05:00:10.000Z"),
      response("resolved", "2026-07-03T05:09:00.000Z"),
    ]);
    expect(progress.nextAction).toBeNull();
    expect(progress.done).toBe(true);
  });
});

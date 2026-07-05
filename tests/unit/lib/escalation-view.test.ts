import { describe, expect, it } from "vitest";

import {
  canProgressIncident,
  canRespondToEvent,
  canTakeOverIncident,
  currentOwnerId,
  escalationStatus,
  firstEscalatedAt,
  highestDispatchedTier,
  isAckAfterEscalation,
  isEscalatedToTier,
  tierLabel,
} from "@/lib/escalation-view";
import type { AlertTier } from "@/domain/types";

function alert(tier: AlertTier, queuedAt: string) {
  return { tier, queuedAt };
}

describe("highestDispatchedTier", () => {
  it("defaults to tier 1 with no alerts and tracks the max tier", () => {
    expect(highestDispatchedTier([])).toBe(1);
    expect(highestDispatchedTier([alert(1, "t0"), alert(2, "t1")])).toBe(2);
    expect(
      highestDispatchedTier([alert(1, "t0"), alert(3, "t2"), alert(2, "t1")]),
    ).toBe(3);
  });
});

describe("firstEscalatedAt", () => {
  it("is null until a tier ≥ 2 alert exists, then the earliest of them", () => {
    expect(firstEscalatedAt([alert(1, "t0")])).toBeNull();
    expect(
      firstEscalatedAt([alert(1, "t0"), alert(2, "t3"), alert(2, "t1"), alert(3, "t5")]),
    ).toBe("t1");
  });
});

describe("escalationStatus", () => {
  it("reports not-escalated at tier 1", () => {
    expect(escalationStatus([alert(1, "t0")])).toEqual({
      tier: 1,
      escalated: false,
      firstEscalatedAt: null,
    });
  });

  it("reports escalated once tier ≥ 2 is dispatched", () => {
    expect(escalationStatus([alert(1, "t0"), alert(2, "t1")])).toEqual({
      tier: 2,
      escalated: true,
      firstEscalatedAt: "t1",
    });
  });
});

describe("isEscalatedToTier", () => {
  const alerts = [alert(1, "t0"), alert(2, "t1")];

  it("never targets a first-line (tier 1) responder", () => {
    expect(isEscalatedToTier(alerts, 1)).toBe(false);
  });

  it("targets a tier-2 responder once the event reaches tier 2", () => {
    expect(isEscalatedToTier([alert(1, "t0")], 2)).toBe(false);
    expect(isEscalatedToTier(alerts, 2)).toBe(true);
  });

  it("targets a tier-3 responder only once the event reaches tier 3", () => {
    expect(isEscalatedToTier(alerts, 3)).toBe(false);
    expect(isEscalatedToTier([...alerts, alert(3, "t2")], 3)).toBe(true);
  });
});

describe("canRespondToEvent", () => {
  const sharma = { id: "guard-sharma", tier: 1 as AlertTier };
  const range = { id: "guard-rrt-alpha", tier: 2 as AlertTier };
  const duty = { id: "district-duty-officer", tier: 3 as AlertTier };
  const paged = (targetRef: string) => ({ targetRef });

  it("always lets a first-line (tier 1) responder act, even before any page", () => {
    expect(canRespondToEvent(sharma, [])).toBe(true);
    expect(canRespondToEvent(sharma, [paged("guard-sharma")])).toBe(true);
  });

  it("locks a senior until an alert has paged them", () => {
    expect(canRespondToEvent(range, [paged("guard-sharma")])).toBe(false);
    expect(canRespondToEvent(duty, [paged("guard-sharma")])).toBe(false);
  });

  it("unlocks a senior once the ladder escalates to them", () => {
    expect(
      canRespondToEvent(range, [paged("guard-sharma"), paged("guard-rrt-alpha")]),
    ).toBe(true);
    expect(
      canRespondToEvent(duty, [
        paged("guard-sharma"),
        paged("guard-rrt-alpha"),
        paged("district-duty-officer"),
      ]),
    ).toBe(true);
  });

  it("unlocks a senior who is the node's own first-line target (e.g. range officer on a remote node)", () => {
    // n3's first-line page goes straight to the range officer.
    expect(canRespondToEvent(range, [paged("guard-rrt-alpha")])).toBe(true);
  });
});

describe("isAckAfterEscalation", () => {
  const escalated = [alert(1, "t0"), alert(2, "t2")];

  it("is false when the event never escalated", () => {
    expect(
      isAckAfterEscalation([{ action: "acknowledged", at: "t9" }], [alert(1, "t0")]),
    ).toBe(false);
  });

  it("is false with no acknowledgement", () => {
    expect(isAckAfterEscalation([{ action: "en_route", at: "t9" }], escalated)).toBe(
      false,
    );
  });

  it("is false when the ack landed before escalation", () => {
    expect(
      isAckAfterEscalation([{ action: "acknowledged", at: "t1" }], escalated),
    ).toBe(false);
  });

  it("is true when the ack landed at or after escalation", () => {
    expect(
      isAckAfterEscalation([{ action: "acknowledged", at: "t2" }], escalated),
    ).toBe(true);
    expect(
      isAckAfterEscalation([{ action: "acknowledged", at: "t5" }], escalated),
    ).toBe(true);
  });
});

describe("tierLabel", () => {
  it("names each ladder rung", () => {
    expect(tierLabel(1)).toMatch(/first/i);
    expect(tierLabel(2)).toMatch(/rapid/i);
    expect(tierLabel(3)).toMatch(/district/i);
  });
});

describe("incident ownership", () => {
  const acks = (entries: Array<[string, string, string]>) =>
    entries.map(([responderId, action, at]) => ({ responderId, action, at }));

  it("has no owner before any acknowledgement", () => {
    expect(currentOwnerId([])).toBeNull();
    expect(currentOwnerId(acks([["r1", "en_route", "2026-07-01T12:00:00.000Z"]]))).toBeNull();
  });

  it("owner is the responder who acknowledged", () => {
    expect(
      currentOwnerId(acks([["beat", "acknowledged", "2026-07-01T12:01:00.000Z"]])),
    ).toBe("beat");
  });

  it("a later acknowledgement (take-over) transfers ownership", () => {
    expect(
      currentOwnerId(
        acks([
          ["beat", "acknowledged", "2026-07-01T12:01:00.000Z"],
          ["beat", "en_route", "2026-07-01T12:02:00.000Z"],
          ["range", "acknowledged", "2026-07-01T12:03:00.000Z"],
        ]),
      ),
    ).toBe("range");
  });

  it("only the current owner may progress the incident", () => {
    const responses = acks([["beat", "acknowledged", "2026-07-01T12:01:00.000Z"]]);
    expect(canProgressIncident("beat", responses)).toBe(true);
    expect(canProgressIncident("range", responses)).toBe(false);
    // before anyone acknowledges there is no owner to lock against
    expect(canProgressIncident("beat", [])).toBe(true);
  });

  it("a paged senior who is not the owner may take over; the owner and unpaged responders may not", () => {
    const responses = acks([["beat", "acknowledged", "2026-07-01T12:01:00.000Z"]]);
    const pagedRange = { id: "range", tier: 2 as const };
    const rangeAlerts = [{ targetRef: "range" }]; // escalation paged the range officer
    expect(canTakeOverIncident(pagedRange, responses, rangeAlerts)).toBe(true);
    // the current owner does not "take over" from themselves
    expect(canTakeOverIncident({ id: "beat", tier: 1 }, responses, rangeAlerts)).toBe(false);
    // a senior who was never paged cannot take over
    expect(canTakeOverIncident(pagedRange, responses, [])).toBe(false);
    // no owner yet => nothing to take over
    expect(canTakeOverIncident(pagedRange, [], rangeAlerts)).toBe(false);
  });
});

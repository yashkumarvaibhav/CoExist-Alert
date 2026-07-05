import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { webexMessageBody, type DeliveryContext } from "@/channels/adapters";
import type { IncursionEvent, Responder } from "@/domain/types";

const event: IncursionEvent = {
  id: "evt-42",
  nodeId: "n2",
  openedAt: "2026-07-01T12:00:00.000Z",
  state: "confirmed",
  confirmedAt: "2026-07-01T12:00:31.000Z",
  resolvedAt: null,
  speciesLabel: "elephant_class",
  leadSignalId: "sig-1",
  confirmSignalId: "sig-2",
  firstDeliveryAt: null,
};

const responder: Responder = {
  id: "guard-sharma",
  name: "Beat Officer R. Sharma",
  role: "guard",
  tier: 1,
  webexEmail: null,
  phoneLabel: "Guard mobile",
  nodeIds: ["n2"],
};

const context: DeliveryContext = { event, node: null, responder, signals: [] };

function actionsOf(body: ReturnType<typeof webexMessageBody>): Array<Record<string, unknown>> {
  const card = body.attachments[0].content as { actions: Array<Record<string, unknown>> };
  return card.actions;
}

describe("webexMessageBody Acknowledge action", () => {
  const OLD_ENV = { ...process.env };
  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("adds an Acknowledge Action.Submit carrying the event and responder ids when the webhook is configured", () => {
    process.env.WEBEX_BOT_TOKEN = "tok";
    process.env.WEBEX_WEBHOOK_SECRET = "sec";
    const actions = actionsOf(webexMessageBody(context, "room-1"));
    const submit = actions.find((action) => action.type === "Action.Submit");
    expect(submit).toBeDefined();
    expect(submit?.data).toEqual({
      coexistAction: "acknowledge",
      eventId: "evt-42",
      responderId: "guard-sharma",
    });
    // link actions are preserved
    expect(actions.filter((a) => a.type === "Action.OpenUrl")).toHaveLength(2);
  });

  it("stays link-only when the webhook secret is absent", () => {
    process.env.WEBEX_BOT_TOKEN = "tok";
    delete process.env.WEBEX_WEBHOOK_SECRET;
    const actions = actionsOf(webexMessageBody(context, "room-1"));
    expect(actions.some((action) => action.type === "Action.Submit")).toBe(false);
    expect(actions).toHaveLength(2);
  });
});

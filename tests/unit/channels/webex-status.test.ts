import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  adapterForChannel,
  postWebexStatusUpdate,
  webexStatusMarkdown,
  type DeliveryContext,
} from "@/channels/adapters";
import type { Alert, IncursionEvent } from "@/domain/types";

describe("webexStatusMarkdown", () => {
  it("announces an acknowledgement with responder, species, node and time", () => {
    const md = webexStatusMarkdown({
      action: "acknowledged",
      responderName: "Beat Officer R. Sharma",
      speciesLabel: "elephant",
      nodeName: "Chalsa rail crossing",
      atLabel: "18:42 IST",
    });
    expect(md).toContain("Acknowledged");
    expect(md).toContain("Beat Officer R. Sharma");
    expect(md).toContain("elephant");
    expect(md).toContain("Chalsa rail crossing");
    expect(md).toContain("18:42 IST");
  });

  it("announces a resolution", () => {
    const md = webexStatusMarkdown({
      action: "resolved",
      responderName: "Range RRT Alpha",
      speciesLabel: "leopard",
      nodeName: "Uttar Madhupur node",
      atLabel: "19:03 IST",
    });
    expect(md).toContain("Resolved");
    expect(md).toContain("leopard");
    expect(md).toContain("Uttar Madhupur node");
    expect(md).toContain("Range RRT Alpha");
  });

  it("falls back to 'large animal' when the species is unknown", () => {
    const md = webexStatusMarkdown({
      action: "acknowledged",
      responderName: "Duty Officer",
      speciesLabel: null,
      nodeName: "field node",
      atLabel: "07:10 IST",
    });
    expect(md).toContain("large animal");
  });
});

describe("postWebexStatusUpdate", () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("is a silent no-op (no network) when the bot token/room are not configured", async () => {
    delete process.env.WEBEX_BOT_TOKEN;
    delete process.env.WEBEX_ROOM_ID;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await postWebexStatusUpdate({
      eventId: "evt-1",
      action: "acknowledged",
      responderName: "Beat Officer R. Sharma",
      speciesLabel: "elephant",
      nodeName: "Chalsa rail crossing",
      atLabel: "18:42 IST",
    });

    expect(result).toEqual({ posted: false, isLive: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Webex status threading", () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...OLD_ENV, WEBEX_BOT_TOKEN: "tok", WEBEX_ROOM_ID: "room-1" };
    // reset the globalThis-backed thread-root map so tests do not leak roots
    (globalThis as unknown as Record<symbol, unknown>)[
      Symbol.for("coexist-alert.webex-thread-roots")
    ] = new Map<string, string>();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("threads the status update under the alert card captured on send", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "root-1" }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

    const event = { id: "evt-1", nodeId: "n2", speciesLabel: "elephant_class" } as IncursionEvent;
    const alert = { id: "al-1", channel: "guard_webex", queuedAt: "2026-07-01T12:00:33.000Z" } as Alert;
    const context: DeliveryContext = {
      event,
      node: null,
      responder: { id: "guard-1" } as DeliveryContext["responder"],
      signals: [],
    };

    // 1) send the alert card -> captures its message id ("root-1") as the root
    await adapterForChannel("guard_webex").dispatch(alert, context);
    // 2) the acknowledge status must thread under that root via parentId
    await postWebexStatusUpdate({
      eventId: "evt-1",
      action: "acknowledged",
      responderName: "Beat Officer R. Sharma",
      speciesLabel: "elephant_class",
      nodeName: "Rail Crossing KM-47",
      atLabel: "18:42 IST",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const statusBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body));
    expect(statusBody.parentId).toBe("root-1");
  });
});

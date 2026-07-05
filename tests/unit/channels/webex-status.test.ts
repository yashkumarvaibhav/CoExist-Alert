import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { postWebexStatusUpdate, webexStatusMarkdown } from "@/channels/adapters";

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

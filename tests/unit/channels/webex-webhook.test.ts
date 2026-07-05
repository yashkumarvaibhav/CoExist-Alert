import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchAttachmentActionInputs,
  parseAttachmentActionId,
  readAckInputs,
  reconcileWebexWebhook,
  verifyWebexSignature,
  webexAckButtonEnabled,
  webhookTargetUrl,
} from "@/channels/webex-webhook";

function sign(body: string, secret: string): string {
  return createHmac("sha1", secret).update(body, "utf8").digest("hex");
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  } as unknown as Response;
}

describe("verifyWebexSignature", () => {
  const secret = "s3cr3t";
  const body = JSON.stringify({ resource: "attachmentActions", data: { id: "act-1" } });

  it("accepts a correct HMAC-SHA1 signature", () => {
    expect(verifyWebexSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    expect(verifyWebexSignature(body, sign(body, "other"), secret)).toBe(false);
  });

  it("rejects a tampered body", () => {
    expect(verifyWebexSignature(`${body} `, sign(body, secret), secret)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyWebexSignature(body, null, secret)).toBe(false);
    expect(verifyWebexSignature(body, "", secret)).toBe(false);
    expect(verifyWebexSignature(body, "abc", secret)).toBe(false);
  });
});

describe("parseAttachmentActionId", () => {
  it("returns the action id for an attachmentActions/created envelope", () => {
    expect(
      parseAttachmentActionId({ resource: "attachmentActions", event: "created", data: { id: "act-9" } }),
    ).toBe("act-9");
  });

  it("ignores other resources, events and malformed bodies", () => {
    expect(parseAttachmentActionId({ resource: "messages", event: "created", data: { id: "m" } })).toBeNull();
    expect(parseAttachmentActionId({ resource: "attachmentActions", event: "deleted", data: { id: "a" } })).toBeNull();
    expect(parseAttachmentActionId({ resource: "attachmentActions", event: "created", data: {} })).toBeNull();
    expect(parseAttachmentActionId("nope")).toBeNull();
    expect(parseAttachmentActionId(null)).toBeNull();
  });
});

describe("readAckInputs", () => {
  it("narrows a valid acknowledge payload", () => {
    expect(readAckInputs({ coexistAction: "acknowledge", eventId: "e1", responderId: "r1" })).toEqual({
      coexistAction: "acknowledge",
      eventId: "e1",
      responderId: "r1",
    });
  });

  it("rejects the wrong action or missing ids", () => {
    expect(readAckInputs({ coexistAction: "resolve", eventId: "e1", responderId: "r1" })).toBeNull();
    expect(readAckInputs({ coexistAction: "acknowledge", responderId: "r1" })).toBeNull();
    expect(readAckInputs({ coexistAction: "acknowledge", eventId: "e1" })).toBeNull();
    expect(readAckInputs(null)).toBeNull();
  });
});

describe("fetchAttachmentActionInputs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the narrowed inputs on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ inputs: { coexistAction: "acknowledge", eventId: "e1", responderId: "r1" } }),
    );
    expect(await fetchAttachmentActionInputs("act-1", "tok")).toEqual({
      coexistAction: "acknowledge",
      eventId: "e1",
      responderId: "r1",
    });
  });

  it("returns null on a non-ok response or a thrown fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({}, false));
    expect(await fetchAttachmentActionInputs("act-1", "tok")).toBeNull();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    expect(await fetchAttachmentActionInputs("act-1", "tok")).toBeNull();
  });
});

describe("reconcileWebexWebhook", () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.WEBEX_BOT_TOKEN;
    delete process.env.WEBEX_WEBHOOK_SECRET;
    process.env.COEXIST_PUBLIC_URL = "https://coexist.example.test";
  });

  it("is a no-op when unconfigured (no network)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await reconcileWebexWebhook()).toBe("unconfigured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not re-create when a matching webhook already exists", async () => {
    process.env.WEBEX_BOT_TOKEN = "tok";
    process.env.WEBEX_WEBHOOK_SECRET = "sec";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ items: [{ targetUrl: webhookTargetUrl(), resource: "attachmentActions" }] }),
    );
    expect(await reconcileWebexWebhook()).toBe("exists");
    expect(fetchSpy).toHaveBeenCalledTimes(1); // list only, no POST
  });

  it("creates the webhook when none matches", async () => {
    process.env.WEBEX_BOT_TOKEN = "tok";
    process.env.WEBEX_WEBHOOK_SECRET = "sec";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "wh-1" }));
    expect(await reconcileWebexWebhook()).toBe("created");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const createArgs = fetchSpy.mock.calls[1];
    expect(createArgs[1]?.method).toBe("POST");
    const sent = JSON.parse(String(createArgs[1]?.body));
    expect(sent.resource).toBe("attachmentActions");
    expect(sent.targetUrl).toBe("https://coexist.example.test/api/webex/webhook");
    expect(sent.secret).toBe("sec");
  });

  it("reports an error when the list call fails", async () => {
    process.env.WEBEX_BOT_TOKEN = "tok";
    process.env.WEBEX_WEBHOOK_SECRET = "sec";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, false));
    expect(await reconcileWebexWebhook()).toBe("error");
  });
});

describe("webexAckButtonEnabled", () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("is true only when both the bot token and webhook secret are set", () => {
    process.env.WEBEX_BOT_TOKEN = "tok";
    delete process.env.WEBEX_WEBHOOK_SECRET;
    expect(webexAckButtonEnabled()).toBe(false);
    process.env.WEBEX_WEBHOOK_SECRET = "sec";
    expect(webexAckButtonEnabled()).toBe(true);
  });
});

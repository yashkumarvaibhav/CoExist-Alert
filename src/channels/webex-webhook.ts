import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webex incoming-webhook support for the Acknowledge button on the alert card.
 *
 * Flow: the alert card carries an `Action.Submit` "Acknowledge". When a guard
 * taps it, Webex POSTs an `attachmentActions` event to our public webhook. We
 * verify the `X-Spark-Signature` HMAC, fetch the action's inputs (the webhook
 * body carries only the action id), and drive the same response pipeline the
 * in-app guard console uses.
 *
 * Entirely env-gated on `WEBEX_WEBHOOK_SECRET`: absent ⇒ no button, no webhook
 * registration, and the endpoint is an inert no-op. Nothing changes until the
 * owner opts in by setting the secret.
 */

export const WEBEX_WEBHOOK_PATH = "/api/webex/webhook";
const WEBEX_WEBHOOKS_URL = "https://webexapis.com/v1/webhooks";
const WEBEX_ATTACHMENT_ACTIONS_URL = "https://webexapis.com/v1/attachment/actions";
const DEFAULT_PUBLIC_URL = "https://coexist.yashkumarvaibhav.me";

/** The submit payload our card embeds and the webhook reads back. */
export interface WebexAckInputs {
  coexistAction: "acknowledge";
  eventId: string;
  responderId: string;
}

export function webexAckButtonEnabled(): boolean {
  return Boolean(process.env.WEBEX_BOT_TOKEN) && Boolean(process.env.WEBEX_WEBHOOK_SECRET);
}

function publicBaseUrl(): string {
  return (process.env.COEXIST_PUBLIC_URL ?? DEFAULT_PUBLIC_URL).replace(/\/+$/, "");
}

export function webhookTargetUrl(): string {
  return `${publicBaseUrl()}${WEBEX_WEBHOOK_PATH}`;
}

/**
 * Verify the `X-Spark-Signature` header: HMAC-SHA1 of the raw request body,
 * keyed by the webhook secret, hex-encoded. Timing-safe and defensive against a
 * missing/short header.
 */
export function verifyWebexSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (typeof signatureHeader !== "string" || signatureHeader.length === 0) {
    return false;
  }
  const expected = createHmac("sha1", secret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.trim().toLowerCase();
  if (provided.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

/** Extract the attachment-action id from a webhook envelope, or null if it is not one. */
export function parseAttachmentActionId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const envelope = body as { resource?: unknown; event?: unknown; data?: unknown };
  if (envelope.resource !== "attachmentActions" || envelope.event !== "created") return null;
  const data = envelope.data;
  if (typeof data !== "object" || data === null) return null;
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Narrow arbitrary action inputs to our acknowledge payload, or null. */
export function readAckInputs(inputs: unknown): WebexAckInputs | null {
  if (typeof inputs !== "object" || inputs === null) return null;
  const record = inputs as Record<string, unknown>;
  if (record.coexistAction !== "acknowledge") return null;
  if (typeof record.eventId !== "string" || record.eventId.length === 0) return null;
  if (typeof record.responderId !== "string" || record.responderId.length === 0) return null;
  return { coexistAction: "acknowledge", eventId: record.eventId, responderId: record.responderId };
}

/**
 * Fetch an attachment action's submitted inputs. The webhook body only carries
 * the action id; the inputs live behind `GET /attachment/actions/{id}`.
 */
export async function fetchAttachmentActionInputs(
  actionId: string,
  token: string,
): Promise<WebexAckInputs | null> {
  try {
    const response = await fetch(`${WEBEX_ATTACHMENT_ACTIONS_URL}/${encodeURIComponent(actionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { inputs?: unknown };
    return readAckInputs(body.inputs);
  } catch {
    return null;
  }
}

export type WebhookReconcileStatus = "unconfigured" | "exists" | "created" | "error";

/**
 * Idempotently ensure an `attachmentActions` webhook pointing at our public
 * endpoint exists. Called fire-and-forget on boot; a no-op unless the bot token
 * and webhook secret are both configured. Never throws.
 */
export async function reconcileWebexWebhook(): Promise<WebhookReconcileStatus> {
  const token = process.env.WEBEX_BOT_TOKEN;
  const secret = process.env.WEBEX_WEBHOOK_SECRET;
  if (!token || !secret) return "unconfigured";

  const targetUrl = webhookTargetUrl();
  try {
    const listResponse = await fetch(WEBEX_WEBHOOKS_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!listResponse.ok) return "error";
    const listBody = (await listResponse.json()) as {
      items?: Array<{ targetUrl?: unknown; resource?: unknown }>;
    };
    const already = (listBody.items ?? []).some(
      (item) => item.targetUrl === targetUrl && item.resource === "attachmentActions",
    );
    if (already) return "exists";

    const createResponse = await fetch(WEBEX_WEBHOOKS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        name: "CoExist Alert acknowledge",
        targetUrl,
        resource: "attachmentActions",
        event: "created",
        secret,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    return createResponse.ok ? "created" : "error";
  } catch {
    return "error";
  }
}

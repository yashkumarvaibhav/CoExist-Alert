import { NextResponse } from "next/server";

import {
  fetchAttachmentActionInputs,
  parseAttachmentActionId,
  verifyWebexSignature,
} from "@/channels/webex-webhook";
import { getRuntimeRepositories } from "@/db/runtime";
import { notifyWebexStatus } from "@/responses/api";
import { recordEventResponse, ResponseError } from "@/responses/service";
import { publishStreamEvents } from "@/stream/hub";

export const dynamic = "force-dynamic";

/**
 * Webex incoming webhook for the alert card's Acknowledge button. Webex POSTs
 * an `attachmentActions/created` event carrying only the action id; we
 * authenticate it by the `X-Spark-Signature` HMAC (shared secret), fetch the
 * submitted inputs, and drive the exact same response pipeline the in-app guard
 * console uses. Entirely inert unless `WEBEX_BOT_TOKEN` + `WEBEX_WEBHOOK_SECRET`
 * are configured, and it never mutates state without a valid signature.
 */
export async function POST(request: Request): Promise<Response> {
  const token = process.env.WEBEX_BOT_TOKEN;
  const secret = process.env.WEBEX_WEBHOOK_SECRET;
  const rawBody = await request.text();

  if (!token || !secret) {
    return NextResponse.json({ ok: true, skipped: "unconfigured" });
  }
  if (!verifyWebexSignature(rawBody, request.headers.get("x-spark-signature"), secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: "invalid_json" });
  }

  const actionId = parseAttachmentActionId(body);
  if (actionId === null) {
    return NextResponse.json({ ok: true, ignored: "not_an_attachment_action" });
  }

  const inputs = await fetchAttachmentActionInputs(actionId, token);
  if (inputs === null) {
    return NextResponse.json({ ok: true, ignored: "no_ack_inputs" });
  }

  const repos = getRuntimeRepositories();
  try {
    const outcome = recordEventResponse(repos, inputs.eventId, {
      responderId: inputs.responderId,
      action: "acknowledged",
    });
    publishStreamEvents(outcome.streamEvents);
    // Thread the "✅ Acknowledged" status under the alert card, exactly as the
    // in-app acknowledge does. Time-bounded and self-swallowing.
    await notifyWebexStatus(repos, outcome, "acknowledged");
    return NextResponse.json({ ok: true, acknowledged: outcome.event.id });
  } catch (error) {
    if (error instanceof ResponseError) {
      // A tap on an already-acknowledged/resolved/expired event (or an unknown
      // responder) is benign — never 500 back to Webex, which would retry.
      return NextResponse.json({ ok: true, ignored: error.code });
    }
    throw error;
  }
}

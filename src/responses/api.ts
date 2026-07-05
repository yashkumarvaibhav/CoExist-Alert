import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { postWebexStatusUpdate } from "@/channels/adapters";
import { getRuntimeRepositories } from "@/db/runtime";
import { formatIstTime } from "@/lib/time";
import { publishStreamEvents } from "@/stream/hub";

import {
  eventResponsePayloadSchema,
  type EventResponseOutcome,
  recordEventResponse,
  ResponseError,
} from "./service";

type Repositories = ReturnType<typeof getRuntimeRepositories>;

/**
 * Echo the two lifecycle-defining responder actions back into the Webex space
 * so it reads as a running incident thread. Non-blocking and self-contained:
 * any failure is swallowed so a Webex hiccup never breaks recording a response.
 */
async function notifyWebexStatus(
  repos: Repositories,
  outcome: EventResponseOutcome,
  action: "acknowledged" | "resolved",
): Promise<void> {
  try {
    const node = repos.nodes.findById(outcome.event.nodeId);
    const responder = repos.responders.findById(outcome.response.responderId);
    await postWebexStatusUpdate({
      eventId: outcome.event.id,
      action,
      responderName: responder?.name ?? "A responder",
      speciesLabel: outcome.event.speciesLabel,
      nodeName: node?.name ?? "field node",
      atLabel: `${formatIstTime(outcome.response.at)} IST`,
    });
  } catch {
    // Status updates are best-effort; the response is already recorded.
  }
}

async function parseBody(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ResponseError(400, "invalid_json", "Request body must be valid JSON.");
  }

  try {
    return eventResponsePayloadSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ResponseError(400, "invalid_request", "Request body failed validation.");
    }
    throw error;
  }
}

function responseError(error: unknown): NextResponse {
  if (error instanceof ResponseError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "internal_error",
        message: "Unexpected server error.",
      },
    },
    { status: 500 },
  );
}

export async function handleEventResponsePost(
  request: Request,
  eventId: string,
): Promise<NextResponse> {
  try {
    const repos = getRuntimeRepositories();
    const payload = await parseBody(request);
    const outcome = recordEventResponse(repos, eventId, payload);
    publishStreamEvents(outcome.streamEvents);
    if (payload.action === "acknowledged" || payload.action === "resolved") {
      // Awaited (not floated): work left pending after the response returns is
      // not guaranteed to run in the App Router, which silently dropped the
      // acknowledge post. postWebexStatusUpdate is time-bounded and swallows
      // its own errors, so this stays fast and never fails recording.
      await notifyWebexStatus(repos, outcome, payload.action);
    }
    return NextResponse.json({
      response: outcome.response,
      event: outcome.event,
    });
  } catch (error) {
    return responseError(error);
  }
}

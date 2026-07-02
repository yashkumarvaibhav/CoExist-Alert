import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getRuntimeRepositories } from "@/db/runtime";
import { publishStreamEvents } from "@/stream/hub";

import {
  eventResponsePayloadSchema,
  recordEventResponse,
  ResponseError,
} from "./service";

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
    const payload = await parseBody(request);
    const outcome = recordEventResponse(getRuntimeRepositories(), eventId, payload);
    publishStreamEvents(outcome.streamEvents);
    return NextResponse.json({
      response: outcome.response,
      event: outcome.event,
    });
  } catch (error) {
    return responseError(error);
  }
}

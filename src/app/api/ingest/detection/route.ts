import { NextResponse } from "next/server";

import { getRuntimeRepositories } from "@/db/runtime";
import { ingestErrorResponse, parseRequestBody } from "@/ingest/http";
import { detectionPayloadSchema, ingestDetection } from "@/ingest/service";
import { publishStreamEvents } from "@/stream/hub";

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, detectionPayloadSchema);
    const outcome = ingestDetection(getRuntimeRepositories(), payload);
    publishStreamEvents(outcome.streamEvents);
    return NextResponse.json(
      {
        signalId: outcome.signalId,
        eventId: outcome.eventId,
        eventState: outcome.eventState,
      },
      { status: 202 },
    );
  } catch (error) {
    return ingestErrorResponse(error);
  }
}

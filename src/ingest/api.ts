import { NextResponse } from "next/server";

import { getRuntimeRepositories } from "@/db/runtime";
import { publishStreamEvents } from "@/stream/hub";

import { ingestErrorResponse, parseRequestBody } from "./http";
import {
  detectionPayloadSchema,
  heartbeatPayloadSchema,
  ingestDetection,
  ingestHeartbeat,
} from "./service";

/**
 * Ingest API handlers, shared by the public route entries and the in-process
 * simulator transport so both traverse the identical validation + pipeline.
 */

export async function handleHeartbeatPost(request: Request): Promise<NextResponse> {
  try {
    const payload = await parseRequestBody(request, heartbeatPayloadSchema);
    const outcome = ingestHeartbeat(getRuntimeRepositories(), payload);
    publishStreamEvents(outcome.streamEvents);
    return NextResponse.json(
      {
        heartbeatId: outcome.heartbeatId,
        nodeId: outcome.nodeId,
        status: outcome.status,
        effects: outcome.effects,
        outageId: outcome.outageId,
      },
      { status: 202 },
    );
  } catch (error) {
    return ingestErrorResponse(error);
  }
}

export async function handleDetectionPost(request: Request): Promise<NextResponse> {
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

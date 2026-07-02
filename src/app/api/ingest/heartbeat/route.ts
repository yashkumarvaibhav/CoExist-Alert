import { NextResponse } from "next/server";

import { getRuntimeRepositories } from "@/db/runtime";
import { ingestErrorResponse, parseRequestBody } from "@/ingest/http";
import { heartbeatPayloadSchema, ingestHeartbeat } from "@/ingest/service";
import { publishStreamEvents } from "@/stream/hub";

export async function POST(request: Request) {
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

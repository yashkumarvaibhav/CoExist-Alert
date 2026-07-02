import { NextResponse } from "next/server";

import { getRuntimeRepositories } from "@/db/runtime";
import { ingestErrorResponse, parseRequestBody } from "@/ingest/http";
import { heartbeatPayloadSchema, ingestHeartbeat } from "@/ingest/service";

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, heartbeatPayloadSchema);
    const outcome = ingestHeartbeat(getRuntimeRepositories(), payload);
    return NextResponse.json(outcome, { status: 202 });
  } catch (error) {
    return ingestErrorResponse(error);
  }
}

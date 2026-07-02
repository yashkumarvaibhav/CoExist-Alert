import { NextResponse } from "next/server";

import { getRuntimeRepositories } from "@/db/runtime";
import { ingestErrorResponse, parseRequestBody } from "@/ingest/http";
import { detectionPayloadSchema, ingestDetection } from "@/ingest/service";

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, detectionPayloadSchema);
    const outcome = ingestDetection(getRuntimeRepositories(), payload);
    return NextResponse.json(outcome, { status: 202 });
  } catch (error) {
    return ingestErrorResponse(error);
  }
}

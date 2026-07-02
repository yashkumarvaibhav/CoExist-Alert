import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { IngestError } from "./service";

export async function parseRequestBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new IngestError(400, "invalid_json", "Request body must be valid JSON.");
  }

  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new IngestError(400, "invalid_request", "Request body failed validation.");
    }
    throw error;
  }
}

export function ingestErrorResponse(error: unknown): NextResponse {
  if (error instanceof IngestError) {
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

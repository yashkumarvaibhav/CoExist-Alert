import { NextResponse } from "next/server";
import { BUILD_SHA, BUILD_TIME } from "@/lib/build-info";

export function GET() {
  return NextResponse.json({
    sha: BUILD_SHA,
    builtAt: BUILD_TIME,
    mode: process.env.NODE_ENV === "production" ? "production" : "development",
  });
}

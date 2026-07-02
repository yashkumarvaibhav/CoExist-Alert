import { count } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getRuntimeDatabaseClient } from "@/db/runtime";
import { nodes } from "@/db/schema";

function webexMode(): "live" | "simulated" {
  return process.env.WEBEX_BOT_TOKEN && process.env.WEBEX_ROOM_ID
    ? "live"
    : "simulated";
}

export function GET() {
  try {
    const client = getRuntimeDatabaseClient();
    const nodeCount = client.db.select({ value: count() }).from(nodes).get()?.value ?? 0;
    return NextResponse.json({
      ok: true,
      db: { status: "ok", nodes: nodeCount },
      simulator: { status: "not_started" },
      webex: webexMode(),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        db: { status: "error" },
        simulator: { status: "not_started" },
        webex: webexMode(),
      },
      { status: 503 },
    );
  }
}

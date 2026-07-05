import { NextResponse } from "next/server";

import { getCurrentSession } from "@/auth/server";

export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (session === null) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    role: session.role,
    displayName: session.displayName,
    username: session.username,
  });
}

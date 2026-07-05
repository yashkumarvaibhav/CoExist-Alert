import { NextRequest, NextResponse } from "next/server";

import {
  appUrl,
  buildDuoAuthorizeUrl,
  DUO_STATE_COOKIE,
  DUO_STATE_TTL_SECONDS,
  getDuoConfig,
  randomDuoToken,
  safeNextPath,
  signDuoState,
  type DuoStatePayload,
} from "@/auth/duo";
import { roleHome, SESSION_COOKIE, verifySession } from "@/auth/session";

export const runtime = "nodejs";

function redirectToSignIn(next: string): NextResponse {
  const url = appUrl("/");
  url.search = `?signin=1&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session === null) return redirectToSignIn(next);
  if (session.role !== "admin") {
    return NextResponse.redirect(appUrl(roleHome(session.role)));
  }

  const config = getDuoConfig();
  if (config === null || session.mfa === true) {
    return NextResponse.redirect(appUrl(next));
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const state: DuoStatePayload = {
    state: randomDuoToken(),
    nonce: randomDuoToken(),
    next,
    userId: session.userId,
    username: session.username,
    duoUsername: config.username ?? session.username,
    exp: nowSec + DUO_STATE_TTL_SECONDS,
  };
  const response = NextResponse.redirect(
    buildDuoAuthorizeUrl(config, state, session.displayName, nowSec),
  );
  response.cookies.set(DUO_STATE_COOKIE, signDuoState(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/duo",
    maxAge: DUO_STATE_TTL_SECONDS,
  });
  return response;
}

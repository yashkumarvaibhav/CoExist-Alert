import { NextRequest, NextResponse } from "next/server";

import {
  DUO_STATE_COOKIE,
  appUrl,
  exchangeDuoCode,
  getDuoConfig,
  safeNextPath,
  verifyDuoIdToken,
  verifyDuoState,
} from "@/auth/duo";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
} from "@/auth/session";

export const runtime = "nodejs";

function redirectToSignIn(next: string): NextResponse {
  const url = appUrl("/");
  url.search = `?signin=1&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

function clearDuoState(response: NextResponse): void {
  response.cookies.set(DUO_STATE_COOKIE, "", {
    httpOnly: true,
    path: "/api/auth/duo",
    maxAge: 0,
  });
}

function redirectWithDuoStatus(next: string, status: string): NextResponse {
  const url = appUrl(next);
  url.searchParams.set("duo", status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getDuoConfig();
  if (config === null) return NextResponse.redirect(appUrl("/demo"));

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session === null) return redirectToSignIn("/demo");

  const state = verifyDuoState(request.cookies.get(DUO_STATE_COOKIE)?.value);
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const next = safeNextPath(state?.next);
  if (
    state === null ||
    code === null ||
    returnedState === null ||
    returnedState !== state.state ||
    session.userId !== state.userId
  ) {
    const response = redirectWithDuoStatus(next, "invalid");
    clearDuoState(response);
    return response;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  try {
    const { idToken } = await exchangeDuoCode(config, code, nowSec);
    const token = verifyDuoIdToken(idToken, config, {
      nonce: state.nonce,
      username: state.duoUsername,
      nowSec,
    });
    if (token === null) {
      throw new Error("duo_invalid_id_token");
    }

    const response = NextResponse.redirect(appUrl(next));
    response.cookies.set(
      SESSION_COOKIE,
      await signSession({
        ...session,
        mfa: true,
        exp: nowSec + SESSION_TTL_SECONDS,
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      },
    );
    clearDuoState(response);
    return response;
  } catch {
    const response = redirectWithDuoStatus(next, "failed");
    clearDuoState(response);
    return response;
  }
}

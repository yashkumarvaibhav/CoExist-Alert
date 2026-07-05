import { NextResponse, type NextRequest } from "next/server";

import { duoEnabled, isApiPath, routeAccess } from "@/auth/access";
import { roleHome, SESSION_COOKIE, verifySession } from "@/auth/session";

/**
 * Auth + RBAC gate. Public routes pass; protected routes require a valid signed
 * session whose role is permitted. Unauthenticated page requests redirect to
 * the landing page with its sign-in modal open; API requests get 401/403 JSON.
 * Session signatures are verified with Web Crypto so this can run before a
 * request reaches the app.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const access = routeAccess(pathname);
  if (access.kind === "public") {
    return NextResponse.next();
  }

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (session === null) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = `?signin=1&next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (!access.roles.includes(session.role)) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = roleHome(session.role);
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (access.mfa && duoEnabled() && session.mfa !== true) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: "mfa_required" }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/duo/start";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except Next internals and public static assets.
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|opengraph-image|coexist-logo.png|coexist-icon.png|demo-snapshots).*)",
  ],
};

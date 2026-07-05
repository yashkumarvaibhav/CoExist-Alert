import { NextResponse, type NextRequest } from "next/server";

import { isApiPath, routeAccess } from "@/auth/access";
import { roleHome, SESSION_COOKIE, verifySession } from "@/auth/session";

/**
 * Auth + RBAC gate. Public routes pass; protected routes require a valid signed
 * session whose role is permitted. Unauthenticated page requests redirect to
 * /login (with a next path); API requests get 401/403 JSON. Session signatures
 * are verified with Web Crypto so this runs in the edge runtime.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
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
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except Next internals and public static assets.
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|opengraph-image|coexist-logo.png|coexist-icon.png|demo-snapshots).*)",
  ],
};

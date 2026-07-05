import type { UserRole } from "./session";

/**
 * Pure route-access policy, shared by the middleware and its tests. `public`
 * routes need no session; `protected` routes require a session whose role is in
 * the allowed set. Anything unmatched defaults to public (static assets, the
 * landing page's images, etc. — the middleware matcher already excludes most).
 */
export type RouteAccess =
  | { kind: "public" }
  | { kind: "protected"; roles: UserRole[]; mfa?: boolean };

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export function duoEnabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return Boolean(env.DUO_CLIENT_ID && env.DUO_CLIENT_SECRET && env.DUO_API_HOST);
}

export function routeAccess(pathname: string): RouteAccess {
  // Public: landing, health/version monitoring, the Webex webhook (its own
  // X-Spark-Signature auth — Webex's cloud calls it), and the auth endpoints.
  if (pathname === "/") return { kind: "public" };
  if (pathname === "/api/version" || pathname === "/api/health") return { kind: "public" };
  if (pathname === "/api/webex/webhook") return { kind: "public" };
  if (pathname.startsWith("/api/auth/")) return { kind: "public" };

  // Protected console pages.
  if (pathname === "/command" || pathname.startsWith("/command/")) {
    return { kind: "protected", roles: ["command", "admin"] };
  }
  if (pathname === "/guard") return { kind: "protected", roles: ["guard", "command", "admin"] };
  if (pathname === "/channels") return { kind: "protected", roles: ["control", "command", "admin"] };
  if (pathname === "/demo") return { kind: "protected", roles: ["admin"], mfa: true };

  // Protected APIs. Field-driving (ingest/demo) is admin-only; responses and the
  // live stream serve the console roles; the event export is a command view.
  if (pathname.startsWith("/api/ingest")) return { kind: "protected", roles: ["admin"], mfa: true };
  if (pathname.startsWith("/api/demo")) return { kind: "protected", roles: ["admin"], mfa: true };
  if (pathname.startsWith("/api/events")) {
    return { kind: "protected", roles: ["guard", "command", "control", "admin"] };
  }
  if (pathname.startsWith("/api/export")) return { kind: "protected", roles: ["command", "admin"] };
  if (pathname === "/api/stream") {
    return { kind: "protected", roles: ["guard", "command", "control", "admin"] };
  }

  return { kind: "public" };
}

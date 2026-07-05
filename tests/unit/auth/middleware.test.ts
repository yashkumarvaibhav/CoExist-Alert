import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { middleware } from "@/middleware";
import { SESSION_COOKIE, signSession, type SessionPayload } from "@/auth/session";

const adminSession: SessionPayload = {
  userId: "u-admin",
  username: "admin",
  role: "admin",
  responderId: null,
  displayName: "Admin",
  exp: Math.floor(Date.UTC(2026, 6, 5, 22, 0, 0) / 1000),
};

function withSession(url: string, token: string): NextRequest {
  return new NextRequest(url, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}

function configureDuo(): void {
  process.env.DUO_CLIENT_ID = "duo-client";
  process.env.DUO_CLIENT_SECRET = "duo-secret";
  process.env.DUO_API_HOST = "api-example.duosecurity.com";
}

describe("auth middleware", () => {
  afterEach(() => {
    delete process.env.DUO_CLIENT_ID;
    delete process.env.DUO_CLIENT_SECRET;
    delete process.env.DUO_API_HOST;
  });

  it("redirects unauthenticated page requests to the landing sign-in modal", async () => {
    const response = await middleware(
      new NextRequest("http://localhost/command/events?state=confirmed"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?signin=1&next=%2Fcommand%2Fevents%3Fstate%3Dconfirmed",
    );
  });

  it("returns 401 JSON for unauthenticated protected API requests", async () => {
    const response = await middleware(new NextRequest("http://localhost/api/export/events.ndjson"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("redirects signed-in admin page requests to Duo when step-up is configured", async () => {
    configureDuo();
    const token = await signSession(adminSession, "coexist-dev-insecure-secret-change-me");

    const response = await middleware(withSession("http://localhost/demo?scenario=rail", token));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/api/auth/duo/start?next=%2Fdemo%3Fscenario%3Drail",
    );
  });

  it("lets an MFA-complete admin reach step-up routes", async () => {
    configureDuo();
    const token = await signSession(
      { ...adminSession, mfa: true },
      "coexist-dev-insecure-secret-change-me",
    );

    const response = await middleware(withSession("http://localhost/demo", token));

    expect(response.status).toBe(200);
  });

  it("returns 403 JSON for protected APIs that need Duo step-up", async () => {
    configureDuo();
    const token = await signSession(adminSession, "coexist-dev-insecure-secret-change-me");

    const response = await middleware(withSession("http://localhost/api/demo/scenario", token));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "mfa_required" });
  });
});

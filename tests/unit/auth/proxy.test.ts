import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSION_COOKIE, signSession, type SessionPayload } from "@/auth/session";
import { proxy } from "@/proxy";

const adminSession: SessionPayload = {
  userId: "u-admin",
  username: "admin",
  role: "admin",
  responderId: null,
  displayName: "Admin",
  exp: Math.floor(Date.UTC(2100, 0, 1, 0, 0, 0) / 1000),
};
const TEST_AUTH_SECRET = "coexist-dev-insecure-secret-change-me";
const ORIGINAL_ENV = {
  AUTH_SECRET: process.env.AUTH_SECRET,
  DUO_CLIENT_ID: process.env.DUO_CLIENT_ID,
  DUO_CLIENT_SECRET: process.env.DUO_CLIENT_SECRET,
  DUO_API_HOST: process.env.DUO_API_HOST,
};

function withSession(url: string, token: string): NextRequest {
  return new NextRequest(url, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}

function configureDuo(): void {
  process.env.DUO_CLIENT_ID = "duo-client";
  process.env.DUO_CLIENT_SECRET = "duo-secret";
  process.env.DUO_API_HOST = "api-example.duosecurity.com";
}

describe("auth proxy", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = TEST_AUTH_SECRET;
    delete process.env.DUO_CLIENT_ID;
    delete process.env.DUO_CLIENT_SECRET;
    delete process.env.DUO_API_HOST;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("redirects unauthenticated page requests to the landing sign-in modal", async () => {
    const response = await proxy(new NextRequest("http://localhost/command/events?state=confirmed"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?signin=1&next=%2Fcommand%2Fevents%3Fstate%3Dconfirmed",
    );
  });

  it("returns 401 JSON for unauthenticated protected API requests", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/export/events.ndjson"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("redirects signed-in admin page requests to Duo when step-up is configured", async () => {
    configureDuo();
    const token = await signSession(adminSession, TEST_AUTH_SECRET);

    const response = await proxy(withSession("http://localhost/demo?scenario=rail", token));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/api/auth/duo/start?next=%2Fdemo%3Fscenario%3Drail",
    );
  });

  it("lets an MFA-complete admin reach step-up routes", async () => {
    configureDuo();
    const token = await signSession(
      { ...adminSession, mfa: true },
      TEST_AUTH_SECRET,
    );

    const response = await proxy(withSession("http://localhost/demo", token));

    expect(response.status).toBe(200);
  });

  it("returns 403 JSON for protected APIs that need Duo step-up", async () => {
    configureDuo();
    const token = await signSession(adminSession, TEST_AUTH_SECRET);

    const response = await proxy(withSession("http://localhost/api/demo/scenario", token));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "mfa_required" });
  });
});

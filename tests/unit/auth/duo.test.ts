import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as duoCallback } from "@/app/api/auth/duo/callback/route";
import { GET as duoStart } from "@/app/api/auth/duo/start/route";
import {
  buildDuoAuthorizeUrl,
  DUO_STATE_COOKIE,
  getDuoConfig,
  safeNextPath,
  signDuoJwt,
  signDuoState,
  verifyDuoIdToken,
  verifyDuoJwt,
  verifyDuoState,
  type DuoConfig,
  type DuoStatePayload,
} from "@/auth/duo";
import { SESSION_COOKIE, signSession, verifySession, type SessionPayload } from "@/auth/session";

const NOW_MS = Date.UTC(2026, 6, 5, 20, 40, 0);
const NOW_SEC = Math.floor(NOW_MS / 1000);
const CONFIG: DuoConfig = {
  clientId: "duo-client",
  clientSecret: "duo-secret",
  apiHost: "api-example.duosecurity.com",
  publicUrl: "https://coexist.example.test",
  username: null,
};
const SESSION: SessionPayload = {
  userId: "u-admin",
  username: "admin",
  role: "admin",
  responderId: null,
  displayName: "Admin",
  exp: NOW_SEC + 3600,
};

function configureDuo(): void {
  process.env.AUTH_SECRET = "test-auth-secret";
  process.env.COEXIST_PUBLIC_URL = CONFIG.publicUrl;
  process.env.DUO_CLIENT_ID = CONFIG.clientId;
  process.env.DUO_CLIENT_SECRET = CONFIG.clientSecret;
  process.env.DUO_API_HOST = CONFIG.apiHost;
}

function sessionCookie(token: string, state?: string): string {
  const parts = [`${SESSION_COOKIE}=${token}`];
  if (state) parts.push(`${DUO_STATE_COOKIE}=${state}`);
  return parts.join("; ");
}

describe("Duo OIDC helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_MS));
    configureDuo();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.AUTH_SECRET;
    delete process.env.COEXIST_PUBLIC_URL;
    delete process.env.DUO_CLIENT_ID;
    delete process.env.DUO_CLIENT_SECRET;
    delete process.env.DUO_API_HOST;
    delete process.env.DUO_USERNAME;
  });

  it("loads and normalizes Duo config from env", () => {
    process.env.DUO_API_HOST = `https://${CONFIG.apiHost}/`;
    expect(getDuoConfig()).toMatchObject({ apiHost: CONFIG.apiHost, publicUrl: CONFIG.publicUrl });
  });

  it("keeps next paths same-site", () => {
    expect(safeNextPath("/demo?x=1")).toBe("/demo?x=1");
    expect(safeNextPath("https://evil.example")).toBe("/demo");
    expect(safeNextPath("//evil.example/path")).toBe("/demo");
  });

  it("signs and verifies HS512 JWTs without jose", () => {
    const token = signDuoJwt({ aud: "duo-client", nonce: "nonce", exp: NOW_SEC + 60 }, "secret");

    expect(
      verifyDuoJwt(token, "secret", {
        nowSec: NOW_SEC,
        expectedAudience: "duo-client",
        expectedNonce: "nonce",
      }),
    ).toMatchObject({ aud: "duo-client" });
    expect(verifyDuoJwt(`${token}x`, "secret", { nowSec: NOW_SEC })).toBeNull();
  });

  it("signs and verifies short-lived state cookies", () => {
    const state: DuoStatePayload = {
      state: "state-1234567890123456",
      nonce: "nonce-1234567890123456",
      next: "/demo",
      userId: SESSION.userId,
      username: SESSION.username,
      duoUsername: SESSION.username,
      exp: NOW_SEC + 300,
    };

    const token = signDuoState(state, "state-secret");

    expect(verifyDuoState(token, "state-secret", NOW_SEC)).toEqual(state);
    expect(verifyDuoState(token, "wrong-secret", NOW_SEC)).toBeNull();
    expect(verifyDuoState(token, "state-secret", NOW_SEC + 301)).toBeNull();
  });

  it("builds a Duo authorize URL with a signed request JWT", () => {
    const state: DuoStatePayload = {
      state: "state-1234567890123456",
      nonce: "nonce-1234567890123456",
      next: "/demo",
      userId: SESSION.userId,
      username: SESSION.username,
      duoUsername: SESSION.username,
      exp: NOW_SEC + 300,
    };

    const url = buildDuoAuthorizeUrl(CONFIG, state, SESSION.displayName, NOW_SEC);
    const requestJwt = url.searchParams.get("request");

    expect(url.toString()).toContain(`https://${CONFIG.apiHost}/oauth/v1/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(requestJwt).toBeTruthy();
    expect(verifyDuoJwt(requestJwt ?? "", CONFIG.clientSecret, { nowSec: NOW_SEC })).toMatchObject({
      client_id: CONFIG.clientId,
      redirect_uri: `${CONFIG.publicUrl}/api/auth/duo/callback`,
      duo_uname: SESSION.username,
      state: state.state,
      nonce: state.nonce,
    });
  });

  it("verifies Duo id tokens against audience, nonce, username and issuer host", () => {
    const idToken = signDuoJwt(
      {
        iss: `https://${CONFIG.apiHost}/oauth/v1/token`,
        sub: SESSION.username,
        preferred_username: SESSION.username,
        aud: CONFIG.clientId,
        exp: NOW_SEC + 60,
        nonce: "nonce",
      },
      CONFIG.clientSecret,
    );

    expect(
      verifyDuoIdToken(idToken, CONFIG, {
        nonce: "nonce",
        username: SESSION.username,
        nowSec: NOW_SEC,
      }),
    ).toMatchObject({ preferred_username: SESSION.username });
    expect(
      verifyDuoIdToken(idToken, CONFIG, {
        nonce: "wrong",
        username: SESSION.username,
        nowSec: NOW_SEC,
      }),
    ).toBeNull();
  });

  it("starts Duo by redirecting admins to the authorize endpoint and setting state", async () => {
    const token = await signSession(SESSION, "test-auth-secret");
    const response = await duoStart(
      new NextRequest("http://localhost/api/auth/duo/start?next=/demo", {
        headers: { cookie: sessionCookie(token) },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(`https://${CONFIG.apiHost}/oauth/v1/authorize`);
    expect(response.cookies.get(DUO_STATE_COOKIE)?.httpOnly).toBe(true);
    expect(verifyDuoState(response.cookies.get(DUO_STATE_COOKIE)?.value, "test-auth-secret", NOW_SEC)).toMatchObject({
      next: "/demo",
      username: SESSION.username,
    });
  });

  it("marks the session MFA-complete after a valid Duo callback", async () => {
    const state: DuoStatePayload = {
      state: "state-1234567890123456",
      nonce: "nonce-1234567890123456",
      next: "/demo",
      userId: SESSION.userId,
      username: SESSION.username,
      duoUsername: SESSION.username,
      exp: NOW_SEC + 300,
    };
    const sessionToken = await signSession(SESSION, "test-auth-secret");
    const idToken = signDuoJwt(
      {
        iss: `https://${CONFIG.apiHost}/oauth/v1/token`,
        sub: SESSION.username,
        preferred_username: SESSION.username,
        aud: CONFIG.clientId,
        exp: NOW_SEC + 60,
        nonce: state.nonce,
      },
      CONFIG.clientSecret,
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, json: async () => ({ id_token: idToken }) } as Response);

    const response = await duoCallback(
      new NextRequest(`http://localhost/api/auth/duo/callback?code=abc&state=${state.state}`, {
        headers: { cookie: sessionCookie(sessionToken, signDuoState(state, "test-auth-secret")) },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${CONFIG.publicUrl}/demo`);
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://${CONFIG.apiHost}/oauth/v1/token`,
      expect.objectContaining({ method: "POST" }),
    );
    const session = await verifySession(response.cookies.get(SESSION_COOKIE)?.value, "test-auth-secret", NOW_MS);
    expect(session).toMatchObject({ username: SESSION.username, mfa: true });
    expect(response.cookies.get(DUO_STATE_COOKIE)?.maxAge).toBe(0);
  });
});

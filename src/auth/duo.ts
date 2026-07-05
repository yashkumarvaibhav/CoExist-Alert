import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { authSecret } from "./session";

export const DUO_STATE_COOKIE = "coexist_duo_state";
export const DUO_STATE_TTL_SECONDS = 5 * 60;
export const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

export interface DuoConfig {
  clientId: string;
  clientSecret: string;
  apiHost: string;
  publicUrl: string;
  username: string | null;
}

export interface DuoStatePayload {
  state: string;
  nonce: string;
  next: string;
  userId: string;
  username: string;
  duoUsername: string;
  exp: number;
}

export interface DuoIdTokenPayload {
  iss: string;
  sub: string;
  preferred_username: string;
  aud: string;
  exp: number;
  iat?: number;
  auth_time?: number;
  nonce?: string;
}

type JwtAlgorithm = "HS256" | "HS512";
type JwtPayload = Record<string, unknown>;

function cleanApiHost(value: string): string {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function cleanPublicUrl(value: string | undefined): string {
  return (value?.trim() || "https://coexist.yashkumarvaibhav.me").replace(/\/+$/, "");
}

export function getDuoConfig(env: NodeJS.ProcessEnv = process.env): DuoConfig | null {
  const clientId = env.DUO_CLIENT_ID?.trim();
  const clientSecret = env.DUO_CLIENT_SECRET?.trim();
  const apiHostRaw = env.DUO_API_HOST?.trim();
  if (!clientId || !clientSecret || !apiHostRaw) return null;
  return {
    clientId,
    clientSecret,
    apiHost: cleanApiHost(apiHostRaw),
    publicUrl: cleanPublicUrl(env.COEXIST_PUBLIC_URL),
    username: env.DUO_USERNAME?.trim() || null,
  };
}

export function safeNextPath(value: string | null | undefined, fallback = "/demo"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export function appUrl(path: string, env: NodeJS.ProcessEnv = process.env): URL {
  return new URL(safeNextPath(path, "/"), cleanPublicUrl(env.COEXIST_PUBLIC_URL));
}

export function randomDuoToken(bytes = 24): string {
  return base64Url(randomBytes(bytes));
}

function base64Url(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

function hmac(alg: JwtAlgorithm, secret: string, body: string): Buffer {
  return createHmac(alg === "HS512" ? "sha512" : "sha256", secret).update(body).digest();
}

export function signDuoJwt(payload: JwtPayload, secret: string, alg: JwtAlgorithm = "HS512"): string {
  const header = base64Url(JSON.stringify({ typ: "JWT", alg }));
  const body = base64Url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${base64Url(hmac(alg, secret, unsigned))}`;
}

export function verifyDuoJwt<T extends JwtPayload>(
  token: string,
  secret: string,
  options: {
    nowSec?: number;
    expectedAudience?: string;
    expectedNonce?: string;
    allowedAlgorithms?: JwtAlgorithm[];
  } = {},
): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8")) as {
      alg?: JwtAlgorithm;
      typ?: string;
    };
    const alg = header.alg;
    if (header.typ !== "JWT" || (alg !== "HS256" && alg !== "HS512")) return null;
    if (options.allowedAlgorithms && !options.allowedAlgorithms.includes(alg)) return null;
    const unsigned = `${parts[0]}.${parts[1]}`;
    const actual = base64UrlDecode(parts[2]);
    const expected = hmac(alg, secret, unsigned);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8")) as T;
    const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
    const exp =
      typeof payload.exp === "number"
        ? payload.exp
        : typeof payload.exp === "string"
          ? Number(payload.exp)
          : NaN;
    if (!Number.isFinite(exp) || exp <= nowSec) return null;
    if (options.expectedAudience && payload.aud !== options.expectedAudience) return null;
    if (options.expectedNonce && payload.nonce !== options.expectedNonce) return null;
    return payload;
  } catch {
    return null;
  }
}

export function signDuoState(payload: DuoStatePayload, secret = authSecret()): string {
  return signDuoJwt(payload as unknown as JwtPayload, secret, "HS256");
}

export function verifyDuoState(
  token: string | undefined | null,
  secret = authSecret(),
  nowSec = Math.floor(Date.now() / 1000),
): DuoStatePayload | null {
  if (!token) return null;
  const payload = verifyDuoJwt<DuoStatePayload & JwtPayload>(token, secret, {
    nowSec,
    allowedAlgorithms: ["HS256"],
  });
  if (payload === null) return null;
  if (
    typeof payload.state !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.next !== "string" ||
    typeof payload.userId !== "string" ||
    typeof payload.username !== "string" ||
    typeof payload.duoUsername !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  return payload;
}

export function duoRedirectUri(config: DuoConfig): string {
  return `${config.publicUrl}/api/auth/duo/callback`;
}

function endpoint(config: DuoConfig, path: string): string {
  return `https://${config.apiHost}${path}`;
}

export function buildDuoAuthorizeUrl(
  config: DuoConfig,
  state: DuoStatePayload,
  displayUsername: string,
  nowSec = Math.floor(Date.now() / 1000),
): URL {
  const redirectUri = duoRedirectUri(config);
  const request = signDuoJwt(
    {
      response_type: "code",
      scope: "openid",
      exp: nowSec + DUO_STATE_TTL_SECONDS,
      client_id: config.clientId,
      redirect_uri: redirectUri,
      state: state.state,
      duo_uname: state.duoUsername,
      aud: `https://${config.apiHost}`,
      iss: config.clientId,
      nonce: state.nonce,
      display_username: displayUsername,
      dest_app_name: "CoExist Alert",
      dest_app_id: "coexist-alert",
    },
    config.clientSecret,
    "HS512",
  );
  const url = new URL(endpoint(config, "/oauth/v1/authorize"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("request", request);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid");
  url.searchParams.set("state", state.state);
  url.searchParams.set("nonce", state.nonce);
  return url;
}

export function buildClientAssertion(
  config: DuoConfig,
  aud: string,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  return signDuoJwt(
    {
      iss: config.clientId,
      sub: config.clientId,
      aud,
      exp: nowSec + DUO_STATE_TTL_SECONDS,
      iat: nowSec,
      jti: randomDuoToken(),
    },
    config.clientSecret,
    "HS512",
  );
}

export async function exchangeDuoCode(
  config: DuoConfig,
  code: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<{ idToken: string }> {
  const tokenEndpoint = endpoint(config, "/oauth/v1/token");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: duoRedirectUri(config),
    client_assertion_type: CLIENT_ASSERTION_TYPE,
    client_assertion: buildClientAssertion(config, tokenEndpoint, nowSec),
    client_id: config.clientId,
  });
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`duo_token_${response.status}`);
  }
  const data = (await response.json()) as { id_token?: unknown };
  if (typeof data.id_token !== "string") {
    throw new Error("duo_token_missing_id_token");
  }
  return { idToken: data.id_token };
}

export function verifyDuoIdToken(
  idToken: string,
  config: DuoConfig,
  expected: { nonce: string; username: string; nowSec?: number },
): DuoIdTokenPayload | null {
  const payload = verifyDuoJwt<DuoIdTokenPayload & JwtPayload>(idToken, config.clientSecret, {
    nowSec: expected.nowSec,
    expectedAudience: config.clientId,
    expectedNonce: expected.nonce,
    allowedAlgorithms: ["HS256", "HS512"],
  });
  if (payload === null) return null;
  if (payload.preferred_username !== expected.username) return null;
  try {
    const issuer = new URL(payload.iss);
    if (issuer.protocol !== "https:" || issuer.hostname !== config.apiHost) return null;
  } catch {
    return null;
  }
  return payload;
}

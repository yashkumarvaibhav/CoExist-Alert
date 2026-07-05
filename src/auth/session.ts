/**
 * Session tokens for CoExist Alert auth. A token is `base64url(JSON payload)` +
 * "." + `base64url(HMAC-SHA256)`, signed with `AUTH_SECRET`. Signing/verifying
 * use Web Crypto only (no `node:crypto`) so this module is safe to import from
 * the request proxy. Password hashing lives separately in
 * `password.ts` (Node scrypt), imported only by server routes/seed.
 */

export type UserRole = "admin" | "command" | "guard" | "control";

export interface SessionPayload {
  userId: string;
  username: string;
  role: UserRole;
  /** Linked field responder (guard consoles), when the role has one. */
  responderId: string | null;
  displayName: string;
  /** True once Duo MFA is completed (only meaningful when Duo is configured). */
  mfa?: boolean;
  /** Expiry, epoch seconds. */
  exp: number;
}

export const SESSION_COOKIE = "coexist_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12h

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length > 0 ? secret : "coexist-dev-insecure-secret-change-me";
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(payload: SessionPayload, secret = authSecret()): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(body) as BufferSource,
  );
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verify a token's signature and expiry. Returns the payload or null. Never
 * throws — malformed input is just an invalid session.
 */
export async function verifySession(
  token: string | undefined | null,
  secret = authSecret(),
  nowMs: number = Date.now(),
): Promise<SessionPayload | null> {
  if (typeof token !== "string" || token.length === 0) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      base64UrlDecode(signature) as BufferSource,
      encoder.encode(body) as BufferSource,
    );
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(base64UrlDecode(body))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Where a role lands after login when no explicit next path is given. */
export function roleHome(role: UserRole): string {
  switch (role) {
    case "guard":
      return "/guard";
    case "control":
      return "/channels";
    case "command":
    case "admin":
      return "/command";
  }
}

/** Build a payload with a fresh TTL from a user record. */
export function sessionForUser(
  user: { id: string; username: string; role: UserRole; responderId: string | null; displayName: string },
  nowMs: number = Date.now(),
): SessionPayload {
  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    responderId: user.responderId,
    displayName: user.displayName,
    exp: Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS,
  };
}

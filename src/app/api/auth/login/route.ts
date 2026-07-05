import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyPassword } from "@/auth/password";
import {
  roleHome,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionForUser,
  signSession,
} from "@/auth/session";
import { getRuntimeRepositories } from "@/db/runtime";

const loginSchema = z
  .object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(200) })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  let body: z.infer<typeof loginSchema>;
  try {
    body = loginSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const user = getRuntimeRepositories().users.findByUsername(body.username);
  // Verify a hash even when the user is unknown to keep timing uniform.
  const hash = user?.passwordHash ?? "scrypt$00$00";
  const ok = (await verifyPassword(body.password, hash)) && user !== null;
  if (!ok || user === null) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = await signSession(sessionForUser(user));
  const response = NextResponse.json({ ok: true, role: user.role, home: roleHome(user.role) });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

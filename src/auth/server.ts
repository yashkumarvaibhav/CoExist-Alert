import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";

/** Read + verify the current session from the request cookies (server only). */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

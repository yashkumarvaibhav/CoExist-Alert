import { describe, expect, it } from "vitest";

import {
  sessionForUser,
  signSession,
  verifySession,
  type SessionPayload,
} from "@/auth/session";

const SECRET = "test-secret";
const NOW = Date.UTC(2026, 6, 5, 12, 0, 0);

const payload: SessionPayload = {
  userId: "u1",
  username: "commander",
  role: "command",
  responderId: null,
  displayName: "Commander",
  exp: Math.floor(NOW / 1000) + 3600,
};

describe("session tokens", () => {
  it("round-trips a valid signed session", async () => {
    const token = await signSession(payload, SECRET);
    expect(await verifySession(token, SECRET, NOW)).toEqual(payload);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(payload, "other-secret");
    expect(await verifySession(token, SECRET, NOW)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession(payload, SECRET);
    const [body, sig] = token.split(".");
    const forged = `${body}x.${sig}`;
    expect(await verifySession(forged, SECRET, NOW)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signSession(payload, SECRET);
    // one second after expiry
    expect(await verifySession(token, SECRET, (payload.exp + 1) * 1000)).toBeNull();
  });

  it("rejects malformed or missing tokens", async () => {
    expect(await verifySession(undefined, SECRET, NOW)).toBeNull();
    expect(await verifySession("", SECRET, NOW)).toBeNull();
    expect(await verifySession("nodot", SECRET, NOW)).toBeNull();
    expect(await verifySession(".sig", SECRET, NOW)).toBeNull();
  });

  it("sessionForUser stamps a future expiry and carries the responder link", () => {
    const session = sessionForUser(
      { id: "g1", username: "sharma", role: "guard", responderId: "guard-sharma", displayName: "R. Sharma" },
      NOW,
    );
    expect(session.role).toBe("guard");
    expect(session.responderId).toBe("guard-sharma");
    expect(session.exp).toBeGreaterThan(Math.floor(NOW / 1000));
  });
});

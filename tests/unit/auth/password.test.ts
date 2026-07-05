import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/auth/password";

describe("password hashing", () => {
  it("verifies a correct password against its scrypt hash", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("s3cret");
    expect(await verifyPassword("guess", stored)).toBe(false);
  });

  it("salts each hash (same password → different stored value)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$only")).toBe(false);
  });
});

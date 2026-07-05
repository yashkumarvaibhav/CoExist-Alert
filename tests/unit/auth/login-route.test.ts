import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { hashPasswordSync } from "@/auth/password";
import { SESSION_COOKIE, verifySession } from "@/auth/session";
import { createDatabaseClient } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { resetRuntimeDatabase } from "@/db/runtime";

function loginRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  let tempDir: string;
  let databasePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "coexist-login-"));
    databasePath = path.join(tempDir, "test.sqlite");
    process.env.COEXIST_DB_PATH = databasePath;
    process.env.AUTH_SECRET = "test-secret";
    resetRuntimeDatabase();
    const client = createDatabaseClient({ path: databasePath });
    try {
      createRepositories(client.db).users.upsert({
        id: "u-guard",
        username: "guard",
        passwordHash: hashPasswordSync("coexist-demo"),
        role: "guard",
        responderId: "guard-sharma",
        displayName: "Beat Officer R. Sharma",
        createdAt: "2026-06-01T00:00:00.000Z",
      });
    } finally {
      client.close();
    }
  });

  afterEach(() => {
    resetRuntimeDatabase();
    delete process.env.COEXIST_DB_PATH;
    delete process.env.AUTH_SECRET;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("sets a valid session cookie for correct credentials", async () => {
    const response = await login(loginRequest({ username: "guard", password: "coexist-demo" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, role: "guard", home: "/guard" });

    const cookie = response.cookies.get(SESSION_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    const session = await verifySession(cookie?.value, "test-secret");
    expect(session).toMatchObject({ role: "guard", responderId: "guard-sharma", username: "guard" });
  });

  it("rejects a wrong password without a cookie", async () => {
    const response = await login(loginRequest({ username: "guard", password: "wrong" }));
    expect(response.status).toBe(401);
    expect(response.cookies.get(SESSION_COOKIE)?.value ?? "").toBe("");
  });

  it("rejects an unknown user", async () => {
    const response = await login(loginRequest({ username: "ghost", password: "coexist-demo" }));
    expect(response.status).toBe(401);
  });

  it("rejects a malformed body", async () => {
    const response = await login(loginRequest({ username: "" }));
    expect(response.status).toBe(400);
  });
});

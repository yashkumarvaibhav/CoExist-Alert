import path from "node:path";

import { expect, test as setup } from "@playwright/test";

export const ADMIN_STORAGE = path.join(__dirname, "..", "..", "playwright", ".auth", "admin.json");

/**
 * Authenticate once as the admin (who can reach every console) and persist the
 * session cookie. Every other project loads this storageState, so the existing
 * e2e can visit protected routes without each test logging in. Auth itself is
 * covered by the unit suite (session/password/access/login-route).
 */
setup("authenticate as admin", async ({ request }) => {
  const response = await request.post("/api/auth/login", {
    data: { username: "admin", password: process.env.COEXIST_ADMIN_PASSWORD || "coexist-demo" },
  });
  expect(response.ok()).toBeTruthy();
  await request.storageState({ path: ADMIN_STORAGE });
});

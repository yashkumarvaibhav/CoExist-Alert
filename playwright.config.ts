import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// Test matrix per QA plan: chromium desktop 1440×900 + mobile 390×844,
// each in light and dark. CI runs the desktop pair (runtime budget);
// the full matrix runs locally.
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };
const mobile = { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

// The app requires auth (RBAC). The `setup` project signs in once as admin (who
// can reach every console) and persists the session; every other project reuses
// it so existing e2e can visit protected routes. Auth is unit-covered too.
const storageState = path.join(__dirname, "playwright", ".auth", "admin.json");
const IGNORE = /flows\.spec\.ts|auth\.setup\.ts/;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3021",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop-light", use: { ...desktop, colorScheme: "light", storageState }, dependencies: ["setup"], testIgnore: IGNORE },
    { name: "desktop-dark", use: { ...desktop, colorScheme: "dark", storageState }, dependencies: ["setup"], testIgnore: IGNORE },
    { name: "mobile-light", use: { ...mobile, colorScheme: "light", storageState }, dependencies: ["setup"], testIgnore: IGNORE },
    { name: "mobile-dark", use: { ...mobile, colorScheme: "dark", storageState }, dependencies: ["setup"], testIgnore: IGNORE },
    {
      // The persona journeys (guard + rail-control acknowledge) mutate shared
      // world state, so they run serially in one file at the guard spec's
      // exact 360×740 target, serialized after desktop-light (home of the
      // other world-mutating scenario tests).
      name: "flows",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
        colorScheme: "light",
        storageState,
      },
      testMatch: /flows\.spec\.ts/,
      dependencies: ["desktop-light"],
    },
  ],
  webServer: {
    // CI builds beforehand and serves the production bundle; local runs reuse
    // an already-running dev server on 3021 when present.
    command: process.env.CI ? "npx next start --port 3021" : "npm run dev",
    url: "http://localhost:3021",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

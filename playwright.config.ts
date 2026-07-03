import { defineConfig, devices } from "@playwright/test";

// Test matrix per QA plan: chromium desktop 1440×900 + mobile 390×844,
// each in light and dark. CI runs the desktop pair (runtime budget);
// the full matrix runs locally.
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };
const mobile = { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

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
    { name: "desktop-light", use: { ...desktop, colorScheme: "light" }, testIgnore: /guard-flow\.spec\.ts/ },
    { name: "desktop-dark", use: { ...desktop, colorScheme: "dark" }, testIgnore: /guard-flow\.spec\.ts/ },
    { name: "mobile-light", use: { ...mobile, colorScheme: "light" }, testIgnore: /guard-flow\.spec\.ts/ },
    { name: "mobile-dark", use: { ...mobile, colorScheme: "dark" }, testIgnore: /guard-flow\.spec\.ts/ },
    {
      // The guard acknowledge journey mutates shared world state, so it runs
      // alone at the spec's exact 360×740 target, serialized after
      // desktop-light (home of the other world-mutating scenario tests).
      name: "guard-flow",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
        colorScheme: "light",
      },
      testMatch: /guard-flow\.spec\.ts/,
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

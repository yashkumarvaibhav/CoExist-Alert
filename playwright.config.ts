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
    { name: "desktop-light", use: { ...desktop, colorScheme: "light" } },
    { name: "desktop-dark", use: { ...desktop, colorScheme: "dark" } },
    { name: "mobile-light", use: { ...mobile, colorScheme: "light" } },
    { name: "mobile-dark", use: { ...mobile, colorScheme: "dark" } },
  ],
  webServer: {
    // CI builds beforehand and serves the production bundle; local runs reuse
    // an already-running dev server on 3021 when present.
    command: process.env.CI ? "npm run start -- --port 3021" : "npm run dev",
    url: "http://localhost:3021",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

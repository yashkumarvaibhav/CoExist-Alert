import { expect, test } from "@playwright/test";

// Read-only demo-panel assertions, safe across the full matrix. The full
// demo journey (preset → cascade → ack → resolved) lives in flows.spec.ts.

test("demo panel renders the warning banner and scenario controls", async ({
  page,
}) => {
  await page.goto("/demo");

  await expect(
    page.getByText("DEMO CONTROLS — drives the simulated field"),
  ).toBeVisible();
  await expect(page.getByText("SIMULATED").first()).toBeVisible();

  const presets = page.getByRole("region", { name: "Scenario presets" });
  for (const label of [
    "Rail crossing confirmed",
    "Village dawn incursion",
    "Weak signal expires",
    "Node blind spot",
  ]) {
    await expect(presets.getByRole("button", { name: label })).toBeVisible();
  }
});

test("demo panel offers manual triggers, link controls and world controls", async ({
  page,
}) => {
  await page.goto("/demo");

  const manual = page.getByRole("region", { name: "Manual trigger" });
  await expect(manual.getByLabel(/Node/)).toBeVisible();
  await expect(manual.getByLabel(/Source/)).toBeVisible();
  await expect(manual.getByLabel(/Confidence/)).toBeVisible();
  await expect(
    manual.getByRole("button", { name: "Send detection" }),
  ).toBeVisible();

  const links = page.getByRole("region", { name: "Node links" });
  await expect(links.getByRole("button", { name: /link/ })).toHaveCount(3);

  const world = page.getByRole("region", { name: "Field controls" });
  await expect(
    world.getByRole("switch", { name: "Ambient chatter" }),
  ).toBeVisible();
  await expect(
    world.getByRole("button", { name: "Reset world…" }),
  ).toBeVisible();

  await expect(
    page.getByText("No actions yet — trigger a preset to start the story."),
  ).toBeVisible();
});

test("demo panel has no horizontal overflow", async ({ page }) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Demo control panel" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

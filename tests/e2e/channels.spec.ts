import { expect, test } from "@playwright/test";

// Read-only channels-view assertions, safe across the full matrix. The
// world-mutating rail acknowledge journey lives in flows.spec.ts.

test("in-geofence hamlets show received alert cards", async ({ page }) => {
  await page.goto("/channels");

  await expect(
    page.getByRole("heading", { name: "Villager phone feed" }),
  ).toBeVisible();

  // Seeded history guarantees delivered villager alerts for these hamlets.
  for (const zoneId of ["zone-uttar-madhupur-east", "zone-chalsa-basti"]) {
    const frame = page.locator(`[data-zone-id="${zoneId}"]`);
    await expect(frame.getByText("In geofence of")).toBeVisible();
    await expect(frame.getByText(/alert$/).first()).toBeVisible();
  }
});

test("the distant hamlet is visibly outside every geofence", async ({
  page,
}) => {
  await page.goto("/channels");

  const distant = page.locator('[data-zone-id="zone-distant-market"]');
  await expect(
    distant.getByText("Outside geofence — not alerted"),
  ).toBeVisible();
  await expect(
    distant.getByText(/the cascade never targets it/),
  ).toBeVisible();
  await expect(distant.locator("li")).toHaveCount(0);
});

test("rail control strip renders acknowledged advisories", async ({
  page,
}) => {
  await page.goto("/channels");

  const strip = page.getByRole("region", { name: "Rail control strip" });
  await expect(strip.getByText("SLOW/STOP").first()).toBeVisible();
  await expect(strip.getByText("Rail Crossing KM-47").first()).toBeVisible();
  // Seeded rail events carry acknowledgements from the response history.
  await expect(strip.getByText(/^ACK/).first()).toBeVisible();
});

test("both panels carry SIMULATED chips and production-channel notes", async ({
  page,
}) => {
  await page.goto("/channels");

  await expect(page.getByText("SIMULATED")).toHaveCount(2);
  await expect(page.getByText(/cell broadcast \/ IVR/)).toBeVisible();
  await expect(page.getByText(/section signalling and TMS/)).toBeVisible();
});

test("channels view has no horizontal overflow", async ({ page }) => {
  await page.goto("/channels");
  await expect(
    page.getByRole("heading", { name: "Field channels" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

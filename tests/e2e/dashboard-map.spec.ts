import { expect, test } from "@playwright/test";

test("map renders one status marker per seeded node", async ({ page }) => {
  await page.goto("/command");
  await expect(page.locator(".coexist-marker")).toHaveCount(3);
});

test("markers carry status labels for screen readers", async ({ page }) => {
  await page.goto("/command");
  const marker = page.locator(".leaflet-marker-icon").first();
  await expect(marker).toHaveAttribute(
    "aria-label",
    /Village Boundary East, Village boundary/,
  );
});

test("marker popup shows node facts, geofence and node link", async ({
  page,
}) => {
  await page.goto("/command");
  await page.locator(".coexist-marker").first().click();

  const popup = page.locator(".leaflet-popup");
  await expect(popup).toContainText("Village Boundary East");
  await expect(popup).toContainText("Battery");
  await expect(page.locator(".coexist-geofence")).toHaveCount(1);

  await popup.getByRole("link", { name: "View node" }).click();
  await expect(page).toHaveURL(/\/command\/nodes\/n1$/);
  await expect(
    page.getByRole("heading", { name: "Village Boundary East" }),
  ).toBeVisible();
});

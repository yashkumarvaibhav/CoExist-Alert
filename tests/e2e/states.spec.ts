import { expect, test } from "@playwright/test";

test("command top bar exposes an off-by-default warning-alarm toggle that flips on", async ({
  page,
}) => {
  await page.goto("/command");

  const toggle = page.getByRole("button", { name: /warning alarm/i });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect(page.getByRole("button", { name: /mute the warning alarm/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the live-status indicator is present in the command top bar", async ({ page }) => {
  await page.goto("/command");
  await expect(page.getByRole("status", { name: /live data stream/i })).toBeVisible();
});

test("command chrome carries no explicit challenge branding", async ({ page }) => {
  await page.goto("/command");
  await expect(page.getByText(/code with cisco/i)).toHaveCount(0);
  await expect(page.getByText(/csr challenge/i)).toHaveCount(0);
});

test("the social share image renders as a PNG", async ({ page }) => {
  const response = await page.request.get("/opengraph-image");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
});

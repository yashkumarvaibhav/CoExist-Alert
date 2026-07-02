import { expect, test } from "@playwright/test";

test("placeholder page renders the wordmark and pitch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("CoExist Alert").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Seconds save lives",
  );
});

test("theme toggle applies an explicit theme", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /theme/i });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    /^(light|dark)$/,
  );
});

test("no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

import { expect, test } from "@playwright/test";

test("the top-bar trigger opens the palette focused on the search input", async ({
  page,
}) => {
  await page.goto("/command");
  await page.getByRole("button", { name: /search.*command palette/i }).click();

  const dialog = page.getByRole("dialog", { name: /search command console/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox")).toBeFocused();

  // Empty query rests on the Screens group.
  await expect(dialog.getByText("Screens")).toBeVisible();
  await expect(dialog.getByRole("option", { name: /Command dashboard/i })).toBeVisible();
});

test("Ctrl+K toggles the palette open", async ({ page }) => {
  await page.goto("/command");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: /search command console/i })).toBeVisible();
});

test("`/` opens the palette when no field is focused", async ({ page }) => {
  await page.goto("/command");
  await page.locator("body").click();
  await page.keyboard.press("/");
  await expect(page.getByRole("dialog", { name: /search command console/i })).toBeVisible();
});

test("typing filters to a node and Enter navigates to it", async ({ page }) => {
  await page.goto("/command");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /search command console/i });
  await dialog.getByRole("combobox").fill("waterhole");
  // Nodes sort ahead of Events, so the first option is the Waterhole node.
  const firstOption = dialog.getByRole("option").first();
  await expect(firstOption).toContainText("Waterhole 7");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/command\/nodes\/n3$/);
});

test("a query with no matches shows the guidance message", async ({ page }) => {
  await page.goto("/command");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /search command console/i });
  await dialog.getByRole("combobox").fill("zzzznotathing");
  await expect(dialog.getByText("No matches — try a node or species name.")).toBeVisible();
});

test("Escape closes the palette and restores focus to the trigger", async ({ page }) => {
  await page.goto("/command");
  const trigger = page.getByRole("button", { name: /search.*command palette/i });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: /search command console/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /search command console/i })).toBeHidden();
  await expect(trigger).toBeFocused();
});

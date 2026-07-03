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

test("the palette stays above the dashboard map layer", async ({ page }) => {
  await page.goto("/command");
  await page.waitForSelector(".leaflet-container");
  await page
    .waitForFunction(() => {
      const tiles = Array.from(document.querySelectorAll<HTMLImageElement>(".leaflet-tile"));
      return tiles.length > 0 && tiles.some((tile) => tile.complete && tile.naturalWidth > 0);
    }, null, { timeout: 20_000 })
    .catch(() => undefined);
  await page.getByRole("button", { name: /search.*command palette/i }).click();

  const dialog = page.getByRole("dialog", { name: /search command console/i });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".search-palette-overlay").evaluate((overlay) => overlay.parentElement?.tagName),
    )
    .toBe("BODY");

  const isDialogOnTop = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.bottom - 24;
    const top = document.elementFromPoint(x, y);
    return top !== null && element.contains(top);
  });

  expect(isDialogOnTop).toBe(true);

  await expect
    .poll(async () =>
      dialog.locator(".search-palette-option").evaluateAll((options) =>
        options.every((option) => {
          const background = getComputedStyle(option).backgroundColor;
          return background !== "rgba(0, 0, 0, 0)" && background !== "transparent";
        }),
      ),
    )
    .toBe(true);

  const inputOutline = await dialog
    .locator(".search-palette-input")
    .evaluate((input) => getComputedStyle(input).outlineStyle);
  expect(inputOutline).toBe("none");
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
  await page.getByRole("button", { name: /search.*command palette/i }).click();
  const dialog = page.getByRole("dialog", { name: /search command console/i });
  await expect(dialog).toBeVisible();
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

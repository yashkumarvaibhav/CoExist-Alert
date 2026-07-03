import { expect, test, type Page } from "@playwright/test";

// The sidebar collapses into a drawer below the lg breakpoint (1024px).
function isMobileViewport(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 1024;
}

// On mobile the nav lives in the drawer; open it before using nav links.
async function openNav(page: Page): Promise<void> {
  if (isMobileViewport(page)) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
}

test("top bar renders wordmark, live status, role switcher and theme toggle", async ({
  page,
}) => {
  await page.goto("/command");
  await expect(
    page.getByRole("heading", { name: "Command dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Live data stream" }),
  ).toContainText("Live", { timeout: 15_000 });
  await expect(
    page.getByRole("combobox", { name: "Switch role view" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /theme/i })).toBeVisible();
});

test("navigation reaches events, analytics and node detail", async ({
  page,
}) => {
  await page.goto("/command");

  await openNav(page);
  await page.getByRole("navigation").getByRole("link", { name: "Events" }).click();
  await expect(page).toHaveURL(/\/command\/events$/);
  await expect(page.getByRole("heading", { name: "Events log" })).toBeVisible();

  await openNav(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Analytics" })
    .click();
  await expect(
    page.getByRole("heading", { name: /Analytics/ }),
  ).toBeVisible();

  await openNav(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Rail Crossing KM-47" })
    .click();
  await expect(page).toHaveURL(/\/command\/nodes\/n2$/);
  await expect(
    page.getByRole("heading", { name: "Rail Crossing KM-47" }),
  ).toBeVisible();
});

test("mobile drawer opens, traps focus start, and closes on Escape", async ({
  page,
}) => {
  test.skip(!isMobileViewport(page), "drawer only exists below lg");

  await page.goto("/command");
  const openButton = page.getByRole("button", { name: "Open navigation" });
  await openButton.click();

  const drawer = page.getByRole("dialog", { name: "Command navigation" });
  await expect(drawer).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close navigation" }),
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(openButton).toBeFocused();
});

test("role switcher navigates between persona views", async ({ page }) => {
  await page.goto("/command");
  const switcher = page.getByRole("combobox", { name: "Switch role view" });

  await switcher.selectOption("/guard");
  await expect(page).toHaveURL(/\/guard$/);
  await expect(page.getByRole("heading", { name: "Guard view" })).toBeVisible();

  await page
    .getByRole("combobox", { name: "Switch role view" })
    .selectOption("/command");
  await expect(page).toHaveURL(/\/command$/);
  await expect(
    page.getByRole("heading", { name: "Command dashboard" }),
  ).toBeVisible();
});

test("skip link is the first focusable control", async ({ page }) => {
  await page.goto("/command");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test("no horizontal overflow on any shell route", async ({ page }) => {
  for (const path of [
    "/command",
    "/command/events",
    "/command/analytics",
    "/command/nodes/n1",
    "/guard",
    "/channels",
    "/demo",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${path}`).toBe(false);
  }
});

test("unknown node id returns 404", async ({ page }) => {
  const response = await page.goto("/command/nodes/does-not-exist");
  expect(response?.status()).toBe(404);
});

import { expect, test } from "@playwright/test";

// The escalation ladder is walkable as personas: the same guard console
// targeted at a senior responder via ?as=. These check the persona plumbing
// (routing, role switcher, chrome); the escalation-view derivation itself is
// unit-covered in tests/unit/lib/escalation-view.test.ts.

test("the role switcher reaches the range-officer escalation console", async ({
  page,
}) => {
  await page.goto("/command");
  await page
    .getByRole("combobox", { name: "Switch role view" })
    .selectOption("/guard?as=guard-rrt-alpha");

  await expect(page).toHaveURL(/\/guard\?as=guard-rrt-alpha$/);
  await expect(
    page.getByRole("heading", { name: "Range response console" }),
  ).toBeVisible();
  await expect(page.getByText("Range RRT Alpha")).toBeVisible();
  await expect(page.getByText(/Tier 2 · escalation responder/)).toBeVisible();
});

test("the district duty console renders for the tier-3 persona", async ({
  page,
}) => {
  await page.goto("/guard?as=district-duty-officer");
  await expect(
    page.getByRole("heading", { name: "District duty console" }),
  ).toBeVisible();
  await expect(page.getByText("District Duty Officer")).toBeVisible();
});

test("an unknown or control-room responder falls back to the beat officer", async ({
  page,
}) => {
  await page.goto("/guard?as=nfr-chalsa-control");
  await expect(page.getByRole("heading", { name: "Guard view" })).toBeVisible();
  await expect(page.getByText("Beat Officer R. Sharma")).toBeVisible();
});

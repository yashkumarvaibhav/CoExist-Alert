import { expect, test } from "@playwright/test";

test("events log filters seeded events and links to the timeline", async ({
  page,
}) => {
  await page.goto("/command/events");

  await expect(page.getByRole("heading", { name: "Events log" })).toBeVisible();
  await expect(page.getByLabel("Node")).toBeVisible();
  await expect(page.getByLabel("State")).toBeVisible();

  await page.getByLabel("Node").selectOption("n2");
  await page.getByLabel("State").selectOption("resolved");
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page).toHaveURL(/nodeId=n2/);
  await expect(page).toHaveURL(/state=resolved/);
  await expect(page.getByRole("table")).toContainText("Rail Crossing KM-47");
  await expect(page.getByRole("table")).toContainText("Lead time");

  await page.getByRole("link", { name: "Open timeline" }).first().click();
  await expect(page).toHaveURL(/\/command\/events\/.+/);
  await expect(
    page.getByRole("heading", { name: /Rail Crossing KM-47/ }),
  ).toBeVisible();
});

test("event detail renders the cascade timeline proof", async ({ page }) => {
  await page.goto("/command/events/hist-01-n2");

  await expect(
    page.getByRole("heading", { name: /Elephant Class.*Rail Crossing KM-47/ }),
  ).toBeVisible();
  const timeline = page.getByRole("region", { name: "Cascade timeline" });
  await expect(timeline).toContainText("Signal");
  await expect(timeline).toContainText("CONFIRMED");
  await expect(timeline).toContainText("Siren");
  await expect(timeline).toContainText("Villagers");
  await expect(timeline).toContainText("Webex");
  await expect(timeline).toContainText("Control");
  await expect(timeline).toContainText("SIMULATED");
  await expect(timeline).toContainText("escalation cancelled");

  const facts = page.getByRole("complementary", { name: "Event facts" });
  await expect(facts).toContainText("Lead time");
  await expect(facts).toContainText("Delivery statuses");
  await expect(facts).toContainText("Tier 1");
});

test("expired event detail tells the suppression story", async ({ page }) => {
  await page.goto("/command/events/expired-04-n2");

  await expect(
    page.getByRole("heading", { name: "Suppressed signal — Rail Crossing KM-47" }),
  ).toBeVisible();
  await expect(page.getByText("Single low-confidence signal — no alert sent.")).toBeVisible();
  await expect(page.getByText("No alert rows — suppression held.")).toBeVisible();
});

test("events routes have no horizontal overflow", async ({ page }) => {
  for (const path of [
    "/command/events",
    "/command/events?nodeId=n2&state=resolved",
    "/command/events/hist-01-n2",
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

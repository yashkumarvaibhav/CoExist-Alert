import { expect, test } from "@playwright/test";

// Read-only guard-view assertions, safe across the full matrix. The
// world-mutating acknowledge journey lives in guard-flow.spec.ts, which runs
// in its own serialized project.

test("guard view renders the shift card with the simulated position", async ({
  page,
}) => {
  await page.goto("/guard");

  await expect(page.getByRole("heading", { name: "Guard view" })).toBeVisible();

  const shift = page.getByRole("region", { name: "Shift" });
  await expect(shift.getByText("Beat Officer R. Sharma")).toBeVisible();
  await expect(shift.getByText("Guard mobile")).toBeVisible();
  await expect(shift.getByText("Uttar Madhupur beat post")).toBeVisible();
  await expect(shift.getByText("SIMULATED")).toBeVisible();
});

test("guard view lists assigned nodes with status and distance", async ({
  page,
}) => {
  await page.goto("/guard");

  const assigned = page.getByRole("region", { name: "Assigned nodes" });
  for (const name of ["Village Boundary East", "Rail Crossing KM-47"]) {
    await expect(assigned.getByText(name)).toBeVisible();
  }
  // Waterhole 7 belongs to RRT Alpha, not this beat guard.
  await expect(assigned.getByText("Waterhole 7")).toHaveCount(0);
  await expect(assigned.getByText(/away/).first()).toBeVisible();
});

test("guard view shows the recent responses ledger", async ({ page }) => {
  await page.goto("/guard");

  const history = page.getByRole("region", { name: "Recent responses" });
  await expect(history).toBeVisible();
  // Seeded history guarantees resolved events with recorded response deltas.
  await expect(history.getByText(/Resolved \d{2} \w{3} \d{4}/).first()).toBeVisible();
});

test("guard view has no horizontal overflow", async ({ page }) => {
  await page.goto("/guard");
  await expect(page.getByRole("heading", { name: "Guard view" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

import { expect, test } from "@playwright/test";

test("analytics renders the hotspot heatmap with honest scope captions", async ({
  page,
}) => {
  await page.goto("/command/analytics");

  await expect(
    page.getByRole("heading", { name: "Analytics & hotspots" }),
  ).toBeVisible();
  await expect(page.getByText("SIMULATED").first()).toBeVisible();
  await expect(page.getByText("Splunk-style aggregation")).toBeVisible();
  await expect(page.getByText(/30 d window/)).toBeVisible();
  await expect(page.getByText(/sample n=/)).toBeVisible();
  await expect(page.getByText("Peak cell")).toBeVisible();
  await expect(page.getByText("Dawn band")).toBeVisible();
  await expect(page.getByText("Dusk band")).toBeVisible();

  await expect(
    page.getByRole("img", { name: "Thirty day node by hour hotspot heatmap" }),
  ).toBeVisible();
  const heatmap = page.getByRole("region", { name: "Hotspot heatmap" });
  await expect(heatmap.getByText("Rail Crossing KM-47").first()).toBeVisible();
  await expect(heatmap.getByText("04:00-07:59 IST")).toBeVisible();
  await expect(heatmap.getByText("17:00-20:59 IST")).toBeVisible();
});

test("analytics route has no horizontal overflow", async ({ page }) => {
  await page.goto("/command/analytics");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

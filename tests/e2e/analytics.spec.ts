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
  const exportLink = page.getByRole("link", {
    name: /Export\s+NDJSON\s+SIMULATED/,
  });
  await expect(exportLink).toHaveAttribute(
    "href",
    "/api/export/events.ndjson?window=30d",
  );
  await expect(exportLink).toHaveAttribute("download", "coexist-events.ndjson");
  const heatmap = page.getByRole("region", { name: "Hotspot heatmap" });
  await expect(heatmap.getByText(/sample n=/)).toBeVisible();
  await expect(page.getByText("Peak cell")).toBeVisible();
  await expect(page.getByText("Dawn band")).toBeVisible();
  await expect(page.getByText("Dusk band")).toBeVisible();

  await expect(
    page.getByRole("img", { name: "30 d node by hour hotspot heatmap" }),
  ).toBeVisible();
  await expect(heatmap.getByText("Rail Crossing KM-47").first()).toBeVisible();
  await expect(heatmap.getByText("04:00-07:59 IST")).toBeVisible();
  await expect(heatmap.getByText("17:00-20:59 IST")).toBeVisible();
});

test("analytics renders reliability KPI definitions and trend strips", async ({
  page,
}) => {
  await page.goto("/command/analytics");

  const kpis = page.getByRole("region", { name: "Reliability KPIs" });
  await expect(kpis.getByText("Median + p95 lead time")).toBeVisible();
  await expect(kpis.getByText("Delivery success by channel")).toBeVisible();
  await expect(kpis.getByText("Response time")).toBeVisible();
  await expect(kpis.getByText("Uptime by node")).toBeVisible();
  await expect(kpis.getByText("Blind-spot minutes")).toBeVisible();
  await expect(kpis.getByText(/sample n=/).first()).toBeVisible();
  await expect(
    kpis.getByText("Detection opened to first delivered alert."),
  ).toBeVisible();
  await expect(
    kpis.getByRole("img", { name: "Events/day trend" }),
  ).toBeVisible();
  await expect(
    kpis.getByRole("img", { name: "Response-time trend" }),
  ).toBeVisible();
});

test("analytics exposes the insufficient-sample state for a tiny window", async ({
  page,
}) => {
  await page.goto("/command/analytics?window=1h");

  await expect(page.getByRole("link", { name: "1 h" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText(/1 h window/)).toBeVisible();
  const kpis = page.getByRole("region", { name: "Reliability KPIs" });
  const leadTime = kpis.getByRole("article", {
    name: "Median + p95 lead time",
  });
  const response = kpis.getByRole("article", {
    name: "Response time",
  });
  await expect(leadTime.getByText("n < 5").first()).toBeVisible();
  await expect(leadTime.getByText(/sample n=[0-4]/)).toBeVisible();
  await expect(response.getByText("n < 5").first()).toBeVisible();
  await expect(response.getByText(/sample n=[0-4]/)).toBeVisible();
});

test("analytics export follows the selected window", async ({ page }) => {
  await page.goto("/command/analytics?window=7d");

  const exportLink = page.getByRole("link", {
    name: /Export\s+NDJSON\s+SIMULATED/,
  });
  await expect(exportLink).toHaveAttribute(
    "href",
    "/api/export/events.ndjson?window=7d",
  );
});

test("analytics route has no horizontal overflow", async ({ page }) => {
  for (const path of ["/command/analytics", "/command/analytics?window=1h"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${path}`).toBe(false);
  }
});

import { expect, test } from "@playwright/test";

test("node detail renders facts, health history and outage ledger", async ({
  page,
}) => {
  await page.goto("/command/nodes/n2");

  await expect(
    page.getByRole("heading", { name: "Rail Crossing KM-47" }),
  ).toBeVisible();
  const facts = page.getByRole("region", { name: "Node facts" });
  await expect(facts.getByText("Rail crossing", { exact: true })).toBeVisible();
  await expect(facts.getByText("26.8900, 88.8900")).toBeVisible();
  await expect(facts.getByText("2200 m")).toBeVisible();

  await expect(facts).toContainText(/Battery|Link quality/);
  await expect(
    page.getByRole("region", { name: "24 h battery + link health" }),
  ).toContainText("Reliability model: ThousandEyes synthetic tests");
  await expect(page.getByText("SIMULATED").first()).toBeVisible();
  await expect(
    page.getByRole("img", { name: /24 hour battery and link history/i }),
  ).toBeVisible();

  const ledger = page.getByRole("region", {
    name: "24 h battery + link health",
  });
  await expect(ledger.getByText("Outage ledger")).toBeVisible();
  await expect(ledger.getByText("Ops alerted")).toBeVisible();
});

test("node detail shows recent simulated signals and assigned responders", async ({
  page,
}) => {
  await page.goto("/command/nodes/n2");

  const signals = page.getByRole("region", { name: "Recent field signals" });
  await expect(signals.getByText("SIMULATED")).toBeVisible();
  await expect(signals.getByText(/Camera|Thermal|Motion|Acoustic/).first()).toBeVisible();
  await expect(signals.getByText(/large-animal|elephant-class/).first()).toBeVisible();
  await expect(signals.getByRole("link", { name: /resolved|confirmed|event/ }).first()).toBeVisible();

  const responders = page.getByRole("region", {
    name: "Assigned responders",
  });
  await expect(responders.getByText("Beat Officer R. Sharma")).toBeVisible();
  await expect(responders.getByText("NFR Section Control - Chalsa")).toBeVisible();
  await expect(responders.getByText("Tier 1").first()).toBeVisible();
});

test("node detail has no horizontal overflow", async ({ page }) => {
  await page.goto("/command/nodes/n2");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

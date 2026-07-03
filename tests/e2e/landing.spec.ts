import { expect, test } from "@playwright/test";

test("landing page tells the mission story with primary CTAs", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Seconds save lives on both sides.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Why it exists")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The tragedy is almost always about time." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "From first movement to first responder." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A dead sensor is a missed warning." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Built like public infrastructure." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Every promise on this page is a number in the product.",
    }),
  ).toBeVisible();

  await expect(page.getByRole("link", { name: "Open command dashboard" })).toHaveAttribute(
    "href",
    "/command",
  );
  await expect(page.getByRole("link", { name: "View on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/yashkumarvaibhav/CoExist-Alert",
  );
  await expect(page.getByRole("link", { name: "View analytics" })).toHaveAttribute(
    "href",
    "/command/analytics",
  );
  await expect(page.getByText("build").last()).toBeVisible();
});

test("landing page keeps event branding out and labels simulation honestly", async ({
  page,
}) => {
  await page.goto("/");

  // The page presents the product itself; no explicit challenge/company
  // branding copy anywhere on the landing surface.
  await expect(page.getByText(/code with cisco/i)).toHaveCount(0);
  await expect(page.getByText(/csr challenge/i)).toHaveCount(0);

  // Honesty labels stay: the hero field chip and the architecture rows.
  await expect(page.getByText("SIMULATED FIELD")).toBeVisible();

  const architecture = page.getByRole("region", {
    name: "Built like public infrastructure.",
  });
  for (const stage of ["Sense", "Connect", "Observe", "Engage", "Secure"]) {
    await expect(architecture.getByText(stage, { exact: true })).toBeVisible();
  }
  await expect(architecture.getByText("SIMULATED", { exact: true }).first()).toBeVisible();
  await expect(architecture.getByText("LIVE/SIMULATED")).toBeVisible();
  await expect(architecture.getByText("ROADMAP")).toBeVisible();
});

test("landing page honors reduced-motion users", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.getByTestId("landing-scene")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Seconds save lives on both sides.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open command dashboard" })).toBeVisible();
});

test("landing page has no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

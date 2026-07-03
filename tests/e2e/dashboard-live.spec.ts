import { expect, test } from "@playwright/test";

test("KPI strip renders the four stat tiles", async ({ page }) => {
  await page.goto("/command");
  const strip = page.getByRole("region", {
    name: "Key performance indicators",
  });
  await expect(strip.getByText("Sensor uptime")).toBeVisible();
  await expect(strip.getByText("Median lead time")).toBeVisible();
  await expect(strip.getByText("Delivery success")).toBeVisible();
  await expect(strip.getByText("Open events")).toBeVisible();
});

test("live feed renders seeded field activity politely", async ({ page }) => {
  await page.goto("/command");
  const feed = page.getByRole("list", { name: "Live field activity" });
  await expect(feed).toHaveAttribute("aria-live", "polite");
  await expect(feed.locator("li").first()).toBeVisible();
});

// The scripted scenario mutates shared simulator/DB state, so it runs on a
// single project only; parallel projects would collide on the one scenario
// slot (409).
test.describe("scripted scenario", () => {
  test(
    "a triggered detection reaches the live feed within two seconds",
    async ({ page, request }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-light",
      "scenario state is shared — run once per matrix",
    );
    await page.goto("/command");
    const feed = page.getByRole("list", { name: "Live field activity" });

    const trigger = await request.post("/api/demo/scenario", {
      data: { action: "trigger_detection", preset: "rail_crossing_confirmed" },
    });
    expect(trigger.ok()).toBeTruthy();

    // Lead signal card must appear live (≤2s budget per the UI spec).
    await expect(
      feed.locator("li", { hasText: "camera · large_animal" }).first(),
    ).toBeVisible({ timeout: 2_000 });

    // Cross-source corroboration lands 4s after the lead and confirms.
    await expect(
      feed
        .locator("li", {
          hasText: "Elephant-class confirmed — Rail Crossing KM-47",
        })
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // Leave the world tidy for reruns: resolve the confirmed event and
    // release the scenario slot.
    const eventId = await feed
      .locator("li[data-event-state='confirmed'], li[data-event-state='responding']")
      .first()
      .getAttribute("data-event-id");
    if (eventId !== null) {
      await request.post(`/api/events/${eventId}/respond`, {
        data: { responderId: "guard-sharma", action: "resolved" },
      });
    }
    await request.post("/api/demo/scenario", { data: { action: "reset" } });
    },
  );
});

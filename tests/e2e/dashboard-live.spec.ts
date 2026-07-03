import { expect, test } from "@playwright/test";

// The scenario tests mutate shared simulator state (scenario slot, killed
// links, `reset`), so this file's tests run in order in one worker instead
// of fully parallel — a reset from one test must not undo another's kill.
test.describe.configure({ mode: "default" });

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

test("sensor health board shows a live row per node", async ({ page }) => {
  await page.goto("/command");
  const board = page.getByRole("region", { name: "Sensor health" });
  await expect(
    board.getByText("Reliability model: ThousandEyes agent tests"),
  ).toBeVisible();
  for (const name of [
    "Village Boundary East",
    "Rail Crossing KM-47",
    "Waterhole 7",
  ]) {
    await expect(board.getByRole("link", { name })).toBeVisible();
  }
  await expect(board.getByText("battery").first()).toBeVisible();
  await expect(board.getByText("link").first()).toBeVisible();
  // heartbeat age ticker resolves once mounted
  await expect(
    board.locator("li[data-node-id='n1']").getByText(/ago|never/),
  ).toBeVisible({ timeout: 10_000 });
});

test("active cascades panel renders with its honesty caption", async ({
  page,
}) => {
  await page.goto("/command");
  const panel = page.getByRole("region", { name: "Active cascades" });
  await expect(
    panel.getByText("Channels SIMULATED · Webex LIVE when configured"),
  ).toBeVisible();
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
    const panel = page.getByRole("region", { name: "Active cascades" });

    // Self-heal from any crashed earlier run: resolve leftover active
    // events and release the scenario slot before triggering.
    const leftoverIds = await panel
      .locator("li[data-cascade-event-id]")
      .evaluateAll((cards) =>
        cards.map((card) => card.getAttribute("data-cascade-event-id")),
      );
    for (const leftoverId of leftoverIds) {
      if (leftoverId === null) continue;
      await request.post(`/api/events/${leftoverId}/respond`, {
        data: { responderId: "guard-sharma", action: "resolved" },
      });
    }
    await request.post("/api/demo/scenario", { data: { action: "reset" } });
    await expect(
      panel.getByText("No active cascades — the boundary is quiet."),
    ).toBeVisible({ timeout: 5_000 });

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

    // The cascade panel picks the event up live: headline, tier, channel
    // dots and the escalation countdown.
    const card = panel.locator("li[data-cascade-event-id]").first();
    await expect(card).toContainText("Elephant-class — Rail Crossing KM-47");
    await expect(card.getByText("Tier 1")).toBeVisible();
    await expect(card.getByText("Siren", { exact: true })).toBeVisible();
    await expect(card.getByText("Webex", { exact: true })).toBeVisible();
    await expect(card.getByText("Control", { exact: true })).toBeVisible();
    await expect(card.getByText(/Auto-escalates in/)).toBeVisible({
      timeout: 10_000,
    });

    // Acknowledgement cancels the countdown, visibly.
    const eventId = await card.getAttribute("data-cascade-event-id");
    expect(eventId).not.toBeNull();
    const ack = await request.post(`/api/events/${eventId}/respond`, {
      data: { responderId: "guard-sharma", action: "acknowledged" },
    });
    expect(ack.ok()).toBeTruthy();
    await expect(
      card.getByText(/Acknowledged by Beat Officer R. Sharma/),
    ).toBeVisible({ timeout: 5_000 });
    await expect(card.getByText(/Auto-escalates in/)).toBeHidden();

    // Leave the world tidy for reruns: resolve the event and release the
    // scenario slot.
    await request.post(`/api/events/${eventId}/respond`, {
      data: { responderId: "guard-sharma", action: "resolved" },
    });
    await request.post("/api/demo/scenario", { data: { action: "reset" } });
    await expect(
      panel.getByText("No active cascades — the boundary is quiet."),
    ).toBeVisible({ timeout: 5_000 });
    },
  );
});

test.describe("blind spot journey", () => {
  test(
    "a killed link surfaces as corridor-blind and recovers on restore",
    async ({ page, request }, testInfo) => {
      test.skip(
        testInfo.project.name !== "desktop-light",
        "mutates shared node state — run once per matrix",
      );
      test.setTimeout(180_000);

      await page.goto("/command");
      const row = page
        .getByRole("region", { name: "Sensor health" })
        .locator("li[data-node-id='n3']");
      await expect(row).toBeVisible();

      const kill = await request.post("/api/demo/scenario", {
        data: { action: "kill_link", nodeId: "n3" },
      });
      expect(kill.ok()).toBeTruthy();

      // Missed-beat rules drive degraded → offline via the 5s sweep.
      await expect(row).toHaveAttribute("data-node-status", "offline", {
        timeout: 90_000,
      });
      await expect(
        row.getByText("Corridor blind — dispatch patrol"),
      ).toBeVisible();
      await expect(
        page
          .getByRole("list", { name: "Live field activity" })
          .locator("li", { hasText: "Corridor blind" })
          .first(),
      ).toBeVisible({ timeout: 10_000 });

      const restore = await request.post("/api/demo/scenario", {
        data: { action: "restore_link", nodeId: "n3" },
      });
      expect(restore.ok()).toBeTruthy();
      await expect(row).toHaveAttribute("data-node-status", "healthy", {
        timeout: 60_000,
      });
    },
  );
});

import { expect, test } from "@playwright/test";

// The S7 acknowledge journey — mutates shared world state (confirms and
// resolves an event on n1), so it runs only in the dedicated "guard-flow"
// project, which depends on desktop-light and therefore never overlaps the
// scenario tests in dashboard-live.spec.ts.

test.describe.configure({ mode: "default" });

test("incoming takeover: acknowledge cancels escalation, stepper records to resolved", async ({
  page,
  request,
}) => {
  await page.goto("/guard");
  await expect(page.getByRole("heading", { name: "Guard view" })).toBeVisible();

  // Self-heal from a crashed earlier run: resolve any active events so the
  // console starts in standby (rerun-safe).
  const leftoverIds = await page
    .locator("[data-incoming-event-id], [data-active-event-id]")
    .evaluateAll((cards) =>
      cards.map(
        (card) =>
          card.getAttribute("data-incoming-event-id") ??
          card.getAttribute("data-active-event-id"),
      ),
    );
  for (const leftoverId of leftoverIds) {
    if (leftoverId === null) continue;
    await request.post(`/api/events/${leftoverId}/respond`, {
      data: { responderId: "guard-sharma", action: "resolved" },
    });
  }
  if (leftoverIds.length > 0) await page.reload();
  await expect(page.getByText("Standing by")).toBeVisible();

  // A single high-confidence detection on an assigned node confirms
  // immediately through the real ingest pipeline (no scenario slot needed).
  const trigger = await request.post("/api/ingest/detection", {
    data: {
      nodeId: "n1",
      at: new Date().toISOString(),
      source: "camera",
      classification: "elephant_class",
      confidence: 0.9,
      snapshotRef: "/demo-snapshots/n1-dawn-boundary.svg",
    },
  });
  expect(trigger.status()).toBe(202);
  const { eventId, eventState } = (await trigger.json()) as {
    eventId: string;
    eventState: string;
  };
  expect(eventState).toBe("confirmed");

  // Takeover card appears live within the 2s UI budget.
  const card = page.locator(`[data-incoming-event-id="${eventId}"]`);
  await expect(card).toBeVisible({ timeout: 2_000 });
  await expect(card.getByText("Elephant-class confirmed")).toBeVisible();
  await expect(card.getByText("Village Boundary East")).toBeVisible();
  await expect(
    card.getByAltText(/Detection snapshot from Village Boundary East/),
  ).toBeVisible();
  await expect(card.getByText(/90% · camera/)).toBeVisible();
  await expect(
    card.getByText(/from Uttar Madhupur beat post/),
  ).toBeVisible();
  // Honesty: no Webex env in tests, so the channel chip reads SIMULATED.
  await expect(card.getByText("Also via Webex")).toBeVisible({
    timeout: 10_000,
  });
  await expect(card.getByText("SIMULATED")).toBeVisible();

  // Escalation countdown runs pre-ack…
  await expect(card.getByText(/Auto-escalates in/)).toBeVisible({
    timeout: 10_000,
  });

  // …and visibly cancels on Acknowledge.
  await card.getByRole("button", { name: "Acknowledge" }).click();
  await expect(
    card.getByText(/Escalation cancelled — acknowledged/),
  ).toBeVisible();
  await expect(card.getByText(/Auto-escalates in/)).toHaveCount(0);

  // Stepper advances with recorded timestamps: En route → On site → Resolved.
  const steps = card.getByRole("list", { name: "Response steps" });
  await expect(steps.getByText(/\d{2}:\d{2}:\d{2} IST/)).toHaveCount(1);

  await card.getByRole("button", { name: "Mark en route" }).click();
  await expect(steps.getByText(/\d{2}:\d{2}:\d{2} IST/)).toHaveCount(2);

  await card.getByRole("button", { name: "Mark on site" }).click();
  await expect(steps.getByText(/\d{2}:\d{2}:\d{2} IST/)).toHaveCount(3);

  await card.getByRole("button", { name: "Mark resolved" }).click();

  // The console returns to standby and the response time is recorded in the
  // recent-responses ledger.
  await expect(page.getByText("Standing by")).toBeVisible();
  const historyItem = page.locator(`[data-history-event-id="${eventId}"]`);
  await expect(historyItem).toBeVisible();
  await expect(historyItem).toContainText(/Ack \+\d+s/);
  await expect(historyItem).toContainText(/Resolved \+/);
});

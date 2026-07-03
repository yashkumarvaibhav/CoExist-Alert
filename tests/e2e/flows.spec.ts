import { expect, test } from "@playwright/test";

// World-mutating persona journeys (S7 guard acknowledge, S8 rail-control
// acknowledge). They confirm and resolve real events, so they run serially in
// this one file inside the dedicated "flows" project, which depends on
// desktop-light and therefore never overlaps the scenario tests in
// dashboard-live.spec.ts.

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

test("rail advisory: acknowledge records the control-room response", async ({
  page,
  request,
}) => {
  await page.goto("/channels");
  await expect(
    page.getByRole("heading", { name: "Rail control strip" }),
  ).toBeVisible();

  // Self-heal from a crashed earlier run: resolve any advisory whose event
  // is still open (its row shows an Acknowledge button).
  const openEventIds = await page
    .locator("li[data-advisory-event-id]")
    .evaluateAll((rows) =>
      rows
        .filter((row) => row.querySelector("button") !== null)
        .map((row) => row.getAttribute("data-advisory-event-id")),
    );
  for (const openId of openEventIds) {
    if (openId === null) continue;
    await request.post(`/api/events/${openId}/respond`, {
      data: { responderId: "nfr-chalsa-control", action: "resolved" },
    });
  }
  if (openEventIds.length > 0) await page.reload();

  // A high-confidence detection at the rail crossing confirms immediately
  // and dispatches the tier-1 cascade, control room included.
  const trigger = await request.post("/api/ingest/detection", {
    data: {
      nodeId: "n2",
      at: new Date().toISOString(),
      source: "camera",
      classification: "elephant_class",
      confidence: 0.9,
      snapshotRef: "/demo-snapshots/n2-camera.svg",
    },
  });
  expect(trigger.status()).toBe(202);
  const { eventId } = (await trigger.json()) as { eventId: string };

  const row = page.locator(`li[data-advisory-event-id="${eventId}"]`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText("SLOW/STOP");
  await expect(row).toContainText("Rail Crossing KM-47");

  // Targeting proof, live: covered hamlets receive the card, the distant
  // hamlet stays visibly silent during the same cascade.
  const chalsa = page.locator('[data-zone-id="zone-chalsa-basti"]');
  await expect(chalsa.getByText(/alert$/).first()).toBeVisible({
    timeout: 10_000,
  });
  const distant = page.locator('[data-zone-id="zone-distant-market"]');
  await expect(
    distant.getByText("Outside geofence — not alerted"),
  ).toBeVisible();
  await expect(distant.locator("li")).toHaveCount(0);

  await row.getByRole("button", { name: "Acknowledge advisory" }).click();
  await expect(
    row.getByText(/ACK \d{2}:\d{2}:\d{2} IST — NFR Section Control - Chalsa/),
  ).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);

  // Leave the world clean for whatever runs next.
  const cleanup = await request.post(`/api/events/${eventId}/respond`, {
    data: { responderId: "nfr-chalsa-control", action: "resolved" },
  });
  expect(cleanup.ok()).toBeTruthy();
});

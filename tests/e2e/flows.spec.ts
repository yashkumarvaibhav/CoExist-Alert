import { expect, test } from "@playwright/test";

// World-mutating persona journeys (S7 guard acknowledge, S8 rail-control
// acknowledge). They confirm and resolve real events, so they run serially in
// this one file inside the dedicated "flows" project, which depends on
// desktop-light and therefore never overlaps the scenario tests in
// dashboard-live.spec.ts.

test.describe.configure({ mode: "default" });

// Installed via addInitScript: replaces WebAudio with a counting mock so the
// chime flow is observable without sound hardware.
function installChimeProbe() {
  const probe = {
    contexts: 0,
    resumes: 0,
    oscillatorStarts: 0,
    oscillatorStops: 0,
  };
  (window as Window & { __chimeProbe?: typeof probe }).__chimeProbe = probe;

  class MockAudioContext {
    state: AudioContextState = "suspended";
    currentTime = 10;
    destination = {};

    constructor() {
      probe.contexts += 1;
    }

    resume() {
      probe.resumes += 1;
      this.state = "running";
      return Promise.resolve();
    }

    createGain() {
      return {
        gain: {
          setValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
      };
    }

    createOscillator() {
      return {
        type: "sine",
        frequency: { setValueAtTime: () => undefined },
        connect: () => undefined,
        start: () => {
          probe.oscillatorStarts += 1;
        },
        stop: () => {
          probe.oscillatorStops += 1;
        },
      };
    }
  }

  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: MockAudioContext,
  });
}

test("sound toggle primes WebAudio and chimes on a new confirmation", async ({
  page,
  request,
}) => {
  await page.addInitScript(installChimeProbe);

  await page.goto("/command");
  await expect(page.getByRole("status", { name: /live data stream/i })).toContainText(
    "Live",
    { timeout: 10_000 },
  );

  const toggle = page.getByRole("button", { name: /enable confirmed-event alert sound/i });
  await toggle.click();
  await expect(page.getByRole("button", { name: /mute confirmed-event alert sound/i }))
    .toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = (window as Window & {
          __chimeProbe?: { contexts: number; resumes: number };
        }).__chimeProbe;
        return { contexts: probe?.contexts ?? 0, resumes: probe?.resumes ?? 0 };
      }),
    )
    .toEqual({ contexts: 1, resumes: 1 });

  // Enabling plays an audible confirmation (one two-oscillator chime).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & {
            __chimeProbe?: { oscillatorStarts: number; oscillatorStops: number };
          }).__chimeProbe ?? { oscillatorStarts: 0, oscillatorStops: 0 },
      ),
    )
    .toMatchObject({ oscillatorStarts: 2, oscillatorStops: 2 });

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

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as Window & {
              __chimeProbe?: { oscillatorStarts: number; oscillatorStops: number };
            }).__chimeProbe ?? { oscillatorStarts: 0, oscillatorStops: 0 },
        ),
      { timeout: 5_000 },
    )
    .toMatchObject({ oscillatorStarts: 4, oscillatorStops: 4 });

  const cleanup = await request.post(`/api/events/${eventId}/respond`, {
    data: { responderId: "guard-sharma", action: "resolved" },
  });
  expect(cleanup.ok()).toBeTruthy();
});

test("a reload with sound already on re-arms the chime after any gesture", async ({
  page,
  request,
}) => {
  await page.addInitScript(installChimeProbe);
  // The persisted preference from an earlier visit — no toggle click happens.
  await page.addInitScript(() => {
    window.localStorage.setItem("sound", "on");
  });

  await page.goto("/command");
  await expect(page.getByRole("status", { name: /live data stream/i })).toContainText(
    "Live",
    { timeout: 15_000 },
  );
  await expect(
    page.getByRole("button", { name: /mute confirmed-event alert sound/i }),
  ).toHaveAttribute("aria-pressed", "true");

  // Any interaction (not the toggle) must unlock the audio context.
  await page.getByRole("heading", { name: "Command dashboard" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = (window as Window & {
          __chimeProbe?: { contexts: number; resumes: number };
        }).__chimeProbe;
        return { contexts: probe?.contexts ?? 0, resumes: probe?.resumes ?? 0 };
      }),
    )
    .toEqual({ contexts: 1, resumes: 1 });

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

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as Window & {
              __chimeProbe?: { oscillatorStarts: number; oscillatorStops: number };
            }).__chimeProbe ?? { oscillatorStarts: 0, oscillatorStops: 0 },
        ),
      { timeout: 5_000 },
    )
    .toMatchObject({ oscillatorStarts: 2, oscillatorStops: 2 });

  const cleanup = await request.post(`/api/events/${eventId}/respond`, {
    data: { responderId: "guard-sharma", action: "resolved" },
  });
  expect(cleanup.ok()).toBeTruthy();
});

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
  const acknowledgeButton = card.getByRole("button", { name: "Acknowledge" });
  await acknowledgeButton.focus();
  await expect(acknowledgeButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    card.getByText(/Escalation cancelled — acknowledged/),
  ).toBeVisible();
  await expect(card.getByText(/Auto-escalates in/)).toHaveCount(0);

  // Stepper advances with recorded timestamps: En route → On site → Resolved.
  const steps = card.getByRole("list", { name: "Response steps" });
  await expect(steps.getByText(/\d{2}:\d{2}:\d{2} IST/)).toHaveCount(1);

  const enRouteButton = card.getByRole("button", { name: "Mark en route" });
  await enRouteButton.focus();
  await page.keyboard.press("Enter");
  await expect(steps.getByText(/\d{2}:\d{2}:\d{2} IST/)).toHaveCount(2);

  const onSiteButton = card.getByRole("button", { name: "Mark on site" });
  await onSiteButton.focus();
  await page.keyboard.press("Enter");
  await expect(steps.getByText(/\d{2}:\d{2}:\d{2} IST/)).toHaveCount(3);

  const resolvedButton = card.getByRole("button", { name: "Mark resolved" });
  await resolvedButton.focus();
  await page.keyboard.press("Enter");

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

test("full demo flow: preset on /demo, cascade on /command, ack on /guard, resolved everywhere", async ({
  page,
  context,
  request,
}) => {
  // Start from a settled world (also releases the scenario slot).
  const reset = await request.post("/api/demo/scenario", {
    data: { action: "reset_world" },
  });
  expect(reset.ok()).toBeTruthy();

  // 1 — Demo panel: run the village dawn preset.
  await page.goto("/demo");
  await expect(
    page.getByText("DEMO CONTROLS — drives the simulated field"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Village dawn incursion" }).click();
  await expect(
    page.getByText(/Preset "Village dawn incursion" started/),
  ).toBeVisible();

  // The scenario log narrates the confirmation live (corroboration at +6s).
  await expect(
    page.getByText(/confirmed at Village Boundary East — cascade dispatched/),
  ).toBeVisible({ timeout: 20_000 });

  // 2 — Command dashboard shows the active cascade.
  const command = await context.newPage();
  await command.goto("/command");
  const panel = command.getByRole("region", { name: "Active cascades" });
  const card = panel.locator("li[data-cascade-event-id]").first();
  await expect(card).toContainText("Elephant-class — Village Boundary East");

  // 3 — Guard acknowledges and walks the stepper to resolution.
  const guard = await context.newPage();
  await guard.goto("/guard");
  const takeover = guard.locator("[data-incoming-event-id]").first();
  await expect(takeover).toBeVisible();
  await takeover.getByRole("button", { name: "Acknowledge" }).click();
  await expect(takeover.getByText(/Escalation cancelled/)).toBeVisible();
  await takeover.getByRole("button", { name: "Mark en route" }).click();
  await takeover.getByRole("button", { name: "Mark on site" }).click();
  await takeover.getByRole("button", { name: "Mark resolved" }).click();
  await expect(guard.getByText("Standing by")).toBeVisible();

  // 4 — The cascade clears live on command; the demo log records it.
  await expect(
    panel.getByText("No active cascades — the boundary is quiet."),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText(/Event at Village Boundary East resolved/),
  ).toBeVisible({ timeout: 10_000 });

  await command.close();
  await guard.close();
});

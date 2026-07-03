import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

interface AuditRoute {
  name: string;
  path: string;
  ready: (page: Page) => Promise<void>;
}

const ROUTES: AuditRoute[] = [
  {
    name: "landing",
    path: "/",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Seconds save lives on both sides." }),
      ).toBeVisible();
    },
  },
  {
    name: "command dashboard",
    path: "/command",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Command dashboard" }),
      ).toBeVisible();
    },
  },
  {
    name: "events log",
    path: "/command/events",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Events log" })).toBeVisible();
    },
  },
  {
    name: "event detail",
    path: "/command/events/hist-01-n2",
    ready: async (page) => {
      await expect(
        page.getByRole("region", { name: "Cascade timeline" }),
      ).toBeVisible();
    },
  },
  {
    name: "node detail",
    path: "/command/nodes/n2",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Rail Crossing KM-47" }),
      ).toBeVisible();
    },
  },
  {
    name: "analytics",
    path: "/command/analytics",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Analytics & hotspots" }),
      ).toBeVisible();
    },
  },
  {
    name: "guard",
    path: "/guard",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Guard view" })).toBeVisible();
    },
  },
  {
    name: "channels",
    path: "/channels",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Field channels" }),
      ).toBeVisible();
    },
  },
  {
    name: "demo",
    path: "/demo",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Demo control panel" }),
      ).toBeVisible();
    },
  },
];

function formatViolations(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 4)
        .map((node) => {
          const target = node.target.join(", ");
          const summary = node.failureSummary?.replace(/\s+/g, " ").trim();
          return `  - ${target}${summary ? `: ${summary}` : ""}`;
        })
        .join("\n");
      return `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}\n${nodes}`;
    })
    .join("\n\n");
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, formatViolations(result.violations)).toHaveLength(0);
}

for (const route of ROUTES) {
  test(`axe has no WCAG A/AA violations on ${route.name}`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: "load" });
    await route.ready(page);
    await expectNoAxeViolations(page);
  });
}

test("axe passes with the command search palette open", async ({ page }) => {
  await page.goto("/command", { waitUntil: "load" });
  await expect(
    page.getByRole("heading", { name: "Command dashboard" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /search.*command palette/i }).click();
  await expect(
    page.getByRole("dialog", { name: "Search command console" }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test("keyboard opens map marker popovers", async ({ page }) => {
  await page.goto("/command", { waitUntil: "load" });
  const marker = page.locator(
    ".leaflet-marker-icon[aria-label*='Rail Crossing KM-47']",
  );
  await marker.focus();
  await expect(marker).toBeFocused();

  await page.keyboard.press("Enter");
  const popup = page.locator(".leaflet-popup");
  await expect(popup).toContainText("Rail Crossing KM-47");
  await expect(popup.getByRole("link", { name: "View node" })).toBeVisible();
});

test("keyboard moves through command palette results", async ({ page }) => {
  await page.goto("/command", { waitUntil: "load" });
  await page.keyboard.press("Control+k");

  const input = page.getByRole("combobox", {
    name: "Search screens, nodes and events",
  });
  await input.fill("rail");
  const firstActive = await input.getAttribute("aria-activedescendant");
  expect(firstActive).not.toBeNull();

  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => input.getAttribute("aria-activedescendant"))
    .not.toBe(firstActive);

  await page.keyboard.press("Home");
  await expect(input).toHaveAttribute("aria-activedescendant", firstActive ?? "");
});

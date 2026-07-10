import { expect, request as apiRequest, test } from "@playwright/test";

/**
 * Installability surface: manifest, icons, service worker and the offline
 * fallback page must all be reachable without a session (a phone's install
 * machinery carries no cookies). The offline navigation behavior itself only
 * exists in production builds (the worker never registers in dev), so that
 * check gates on /api/version's mode.
 */

test("manifest is installable and public", async ({ baseURL }) => {
  const anon = await apiRequest.newContext({ baseURL });
  const response = await anon.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);

  const manifest = await response.json();
  expect(manifest.name).toBe("CoExist Alert");
  expect(manifest.start_url).toBe("/guard");
  expect(manifest.display).toBe("standalone");

  const icons: { src: string; sizes: string }[] = manifest.icons;
  expect(icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  for (const icon of icons) {
    const image = await anon.get(icon.src);
    expect(image.status(), `${icon.src} should be served`).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
  }
  await anon.dispose();
});

test("service worker script is served and never touches the API", async ({
  baseURL,
}) => {
  const anon = await apiRequest.newContext({ baseURL });
  const response = await anon.get("/sw.js");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("javascript");

  const body = await response.text();
  // The live data plane must pass through untouched — SSE, auth, webhook.
  expect(body).toContain('url.pathname.startsWith("/api/")');
  expect(body).toContain("/offline");
  await anon.dispose();
});

test.describe("offline fallback page", () => {
  // The page must render for a signed-out phone that lost its link.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("renders self-contained with honest copy", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await expect(page.getByText("no network link", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Try the guard view again" }),
    ).toBeVisible();
  });
});

test("offline navigation falls back to the offline page (production only)", async ({
  page,
  context,
  baseURL,
}) => {
  const anon = await apiRequest.newContext({ baseURL });
  const version = await (await anon.get("/api/version")).json();
  await anon.dispose();
  test.skip(
    version.mode !== "production",
    "the service worker registers in production builds only",
  );

  await page.goto("/guard");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Precache runs during install; wait until the fallback page is cached.
  await expect
    .poll(() => page.evaluate(() => caches.match("/offline").then(Boolean)), {
      timeout: 15_000,
    })
    .toBe(true);

  await context.setOffline(true);
  try {
    await page.goto("/guard");
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

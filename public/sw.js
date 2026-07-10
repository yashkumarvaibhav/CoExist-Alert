/*
 * CoExist Alert service worker — deliberately minimal.
 *
 * The app is a live console: pages and data must always come from the
 * network. This worker only (1) serves hashed immutable build assets
 * cache-first, and (2) shows the self-contained /offline page when a
 * navigation has no network. It NEVER touches /api/* (the SSE stream, auth
 * and the Webex webhook go straight to the network), and it never caches
 * page HTML, so a redeploy can never be masked by a stale copy.
 *
 * Bump VERSION whenever /offline or the precache list changes — the byte
 * change is what triggers reinstall in already-installed clients.
 */
const VERSION = "v1";
const CACHE = `coexist-pwa-${VERSION}`;
const PRECACHE = ["/offline", "/coexist-icon.png", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // cache: "reload" bypasses the HTTP cache so a new worker version
      // always precaches the freshly deployed offline page.
      .then((cache) =>
        cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function navigateWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const fallback = await caches.match("/offline");
    return (
      fallback ??
      new Response("You are offline and the fallback page is not cached yet.", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Live data plane — never intercepted, never cached.
  if (url.pathname.startsWith("/api/")) return;

  // Content-hashed build assets are immutable: cache-first is always safe.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigateWithOfflineFallback(request));
    return;
  }

  // Everything else (icons, logo, fonts already fetched once): network,
  // falling back to whatever the cache holds.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

import type { Metadata } from "next";

import { APP_NAME } from "@/lib/app-info";

export const metadata: Metadata = {
  title: `Offline — ${APP_NAME}`,
};

// Precached by the service worker and served whenever a navigation has no
// network, so it must render styled from its own HTML alone — the hashed CSS
// bundle may not be in the cache. Styles are inlined with the identity token
// values (light + dark, manual data-theme override winning over the system
// preference, AA-safe pairs from graphic-identity).
export const dynamic = "force-static";

const styles = `
.offline-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: #ffffff; color: #4d4d4d; font-family: Arial, "Helvetica Neue", "Segoe UI", Geneva, sans-serif; line-height: 1.65; }
.offline-card { max-width: 26rem; width: 100%; text-align: center; }
.offline-mark { width: 56px; height: 56px; margin: 0 auto 16px; display: block; }
.offline-eyebrow { font-size: 0.75rem; letter-spacing: 0.14em; text-transform: uppercase; color: #6f6f6f; margin: 0 0 8px; }
.offline-card h1 { font-family: "Newsreader", Georgia, "Times New Roman", serif; font-size: 1.9rem; line-height: 1.1; letter-spacing: -0.02em; color: #333333; margin: 0 0 12px; }
.offline-card p { margin: 0 0 10px; font-size: 0.95rem; }
.offline-note { color: #6f6f6f; font-size: 0.85rem; }
.offline-retry { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; margin-top: 18px; padding: 10px 20px; border-radius: 12px; background: #277a75; color: #ffffff; font-weight: 700; font-size: 0.95rem; text-decoration: none; }
.offline-retry:focus-visible { outline: 2px solid #277a75; outline-offset: 2px; }
[data-theme="dark"] .offline-wrap { background: #10191b; color: rgba(245,248,248,0.84); }
[data-theme="dark"] .offline-card h1 { color: #f5f8f8; }
[data-theme="dark"] .offline-eyebrow, [data-theme="dark"] .offline-note { color: #94a3a4; }
[data-theme="dark"] .offline-retry { background: #7ce4de; color: #0c1416; }
[data-theme="dark"] .offline-retry:focus-visible { outline-color: #7ce4de; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .offline-wrap { background: #10191b; color: rgba(245,248,248,0.84); }
  :root:not([data-theme="light"]) .offline-card h1 { color: #f5f8f8; }
  :root:not([data-theme="light"]) .offline-eyebrow, :root:not([data-theme="light"]) .offline-note { color: #94a3a4; }
  :root:not([data-theme="light"]) .offline-retry { background: #7ce4de; color: #0c1416; }
  :root:not([data-theme="light"]) .offline-retry:focus-visible { outline-color: #7ce4de; }
}
`;

export default function OfflinePage() {
  return (
    <div className="offline-wrap">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <main className="offline-card">
        {/* Plain img on purpose: next/image needs the optimizer, which is unreachable offline. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/coexist-icon.png" alt="" className="offline-mark" />
        <p className="offline-eyebrow">Field console — no network link</p>
        <h1>You are offline</h1>
        <p>
          {APP_NAME} is a live early-warning network: incoming alerts, the map
          and acknowledgements all need a working link.
        </p>
        <p className="offline-note">
          This screen is the console telling you it is blind — the same honesty
          the health board applies to a silent sensor node. Reconnect to
          resume.
        </p>
        <a href="/guard" className="offline-retry">
          Try the guard view again
        </a>
      </main>
    </div>
  );
}

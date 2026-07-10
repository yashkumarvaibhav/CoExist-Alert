import type { MetadataRoute } from "next";

import { APP_NAME, APP_TAGLINE } from "@/lib/app-info";

/**
 * Web app manifest — makes the guard view installable on a responder's phone.
 * start_url is /guard (the mobile response console); scope stays / so the
 * other consoles open inside the installed window. Splash and window chrome
 * use the editorial page white; the maskable icon pads the shield mark into
 * the launcher safe zone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: "CoExist",
    description: `${APP_TAGLINE}. Installable field console for forest guards — alerts, acknowledgement and escalation on the beat.`,
    start_url: "/guard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

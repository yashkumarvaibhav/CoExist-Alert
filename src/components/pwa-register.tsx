"use client";

import { useEffect } from "react";

/**
 * Registers the offline-fallback service worker. Production builds only — a
 * worker caching dev assets would fight hot reload. Registration failure is
 * silent by design: install is a progressive enhancement and the app is fully
 * functional without it.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}

"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared resolved-theme store: manual choice (html[data-theme]) wins over the
 * system preference. The toggle and any theme-dependent canvas (map tiles)
 * subscribe to the same listener set so a manual switch notifies them all.
 */

export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

export function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  listeners.add(onChange);
  return () => {
    media.removeEventListener("change", onChange);
    listeners.delete(onChange);
  };
}

export function getTheme(): Theme {
  const forced = document.documentElement.dataset.theme;
  if (forced === "dark" || forced === "light") return forced;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// Server renders no theme; the client resolves it on hydration.
function getServerTheme(): Theme | null {
  return null;
}

export function setTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // localStorage unavailable (private mode) — theme still applies for the session
  }
  for (const notify of listeners) notify();
}

export function useTheme(): Theme | null {
  return useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
}

"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared sound-preference store: whether the confirmed-event warning hooter
 * sounds on the Command/Guard/Channels views. Off by default (autoplay policy +
 * demo etiquette); the toggle persists the choice to localStorage. Mirrors the
 * theme store so the top-bar toggle and the alarm stay in lockstep.
 */

const STORAGE_KEY = "sound";
const listeners = new Set<() => void>();

export function subscribeSound(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

// Server renders the neutral "off" state; the client resolves on hydration.
function getServerSound(): boolean {
  return false;
}

export function setSoundEnabled(next: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  } catch {
    // localStorage unavailable (private mode) — preference is session-only.
  }
  for (const notify of listeners) notify();
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribeSound, getSoundEnabled, getServerSound);
}

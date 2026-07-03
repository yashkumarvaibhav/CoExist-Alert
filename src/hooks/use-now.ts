"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared 1 Hz clock for elapsed counters and countdowns — one interval no
 * matter how many subscribers, and hydration-safe (the server snapshot is
 * null, so tickers render a placeholder until mounted).
 */

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onTick: () => void) {
  listeners.add(onTick);
  timer ??= setInterval(() => {
    for (const listener of listeners) listener();
  }, 1_000);
  return () => {
    listeners.delete(onTick);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getNowMs(): number {
  return Math.floor(Date.now() / 1_000) * 1_000;
}

export function useNowMs(): number | null {
  return useSyncExternalStore(subscribe, getNowMs, () => null);
}

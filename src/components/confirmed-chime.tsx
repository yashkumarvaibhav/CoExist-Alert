"use client";

import { useEffect, useRef } from "react";

import { useLiveStream } from "@/hooks/use-live-stream";
import { useSoundEnabled } from "@/hooks/use-sound";
import { isNewConfirmation, playChime, primeChime } from "@/lib/chime";
import type { StreamEventType } from "@/stream/events";

// Only event deltas matter for the chime.
const CHIME_EVENT_TYPES: readonly StreamEventType[] = ["event"];

/**
 * Headless: plays a short chime the first time each event confirms, when the
 * sound preference is on. Mounted on Command (shell) and Guard. Renders
 * nothing. Dedupe is by event id so a duplicate or later-state delta is silent.
 */
export function ConfirmedChime() {
  const enabled = useSoundEnabled();
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  const seenRef = useRef<Set<string>>(new Set());

  // With the persisted preference on, a fresh page load has no unlocked audio
  // context (browsers require a user gesture). Re-arm on the first
  // interaction so the chime survives reloads; primeChime is idempotent.
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => primeChime();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [enabled]);

  useLiveStream({
    types: CHIME_EVENT_TYPES,
    onEvent: (event) => {
      if (!isNewConfirmation(seenRef.current, event)) return;
      if (event.type === "event") seenRef.current.add(event.payload.id);
      if (enabledRef.current) playChime();
    },
  });

  return null;
}

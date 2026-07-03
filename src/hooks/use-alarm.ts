"use client";

import { useEffect } from "react";

import { useSoundEnabled } from "@/hooks/use-sound";
import { playHooter, primeHooter } from "@/lib/hooter";

/** Cadence of the repeating warning blast while the alarm is active. */
const ALARM_INTERVAL_MS = 2_000;

/**
 * Repeats the warning hooter while `active` and the sound preference is on.
 * Silences immediately when the alarm clears (acknowledge/resolve) or sound is
 * muted. The WebAudio context needs a user gesture to unlock, so while sound is
 * on we prime on the first interaction; the toggle click also primes + sounds.
 */
export function useAlarm(active: boolean): void {
  const enabled = useSoundEnabled();

  // Re-arm audio on the first user gesture whenever sound is on — a page can
  // load with the persisted preference already on and no unlocking click yet.
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => primeHooter();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [enabled]);

  useEffect(() => {
    if (!active || !enabled) return;
    playHooter();
    const timer = setInterval(playHooter, ALARM_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, enabled]);
}

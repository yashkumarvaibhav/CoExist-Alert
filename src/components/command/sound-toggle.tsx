"use client";

import { playHooter, primeHooter } from "@/lib/hooter";
import { setSoundEnabled, useSoundEnabled } from "@/hooks/use-sound";

/**
 * Top-bar toggle for the confirmed-event warning hooter (Command/Guard/
 * Channels). Off by default. Enabling counts as the user gesture that unlocks
 * the WebAudio context, so we prime it here — browsers block audio started
 * without a prior interaction — and sound one blast as an audible preview.
 */
export function SoundToggle() {
  const enabled = useSoundEnabled();

  function toggle() {
    const next = !enabled;
    if (next) {
      primeHooter();
      // Sound one blast as an audible preview of the warning tone — the toggle
      // click is the unlocking gesture, so this also proves audio works.
      playHooter();
    }
    setSoundEnabled(next);
  }

  const label = enabled ? "Mute the warning alarm" : "Enable the warning alarm";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 items-center justify-center rounded-md border border-line text-ink transition-colors hover:bg-hover"
    >
      {enabled ? (
        // speaker with waves — sound is on
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H3v6h3l5 4z" />
          <path d="M16 9a3.5 3.5 0 0 1 0 6M19 6a7 7 0 0 1 0 12" />
        </svg>
      ) : (
        // speaker muted — sound is off (neutral pre-hydration icon)
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H3v6h3l5 4z" />
          <path d="M22 9l-6 6M16 9l6 6" />
        </svg>
      )}
    </button>
  );
}

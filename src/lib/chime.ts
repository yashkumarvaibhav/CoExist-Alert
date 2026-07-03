import type { FieldStreamEvent } from "@/stream/events";

/**
 * Confirmed-event chime for Command/Guard. A short, gentle two-note tone —
 * meant to draw an operator's eye, not to alarm. Audio is opt-in (see
 * use-sound) and the WebAudio context must be unlocked by a user gesture
 * (the toggle), so we prime it there and only play once primed.
 */

let audioContext: AudioContext | null = null;

type WindowWithAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function resolveAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  if (typeof AudioContext !== "undefined") return AudioContext;
  return (window as WindowWithAudio).webkitAudioContext ?? null;
}

/** Create/resume the audio context from within a user gesture (toggle click). */
export function primeChime(): void {
  const Ctor = resolveAudioContextCtor();
  if (Ctor === null) return;
  audioContext ??= new Ctor();
  if (audioContext.state === "suspended") void audioContext.resume();
}

/* A resume() started outside a user gesture stays pending until the browser
   unlocks audio; past this age a late-resolving chime is stale noise. */
const RESUME_CHIME_MAX_AGE_MS = 1_500;

function strike(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  gain.connect(ctx.destination);

  // Two soft notes (E5 → B5), overlapping into a "confirm" interval.
  for (const [freq, start] of [
    [659.25, now],
    [987.77, now + 0.14],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    osc.connect(gain);
    osc.start(start);
    osc.stop(now + 0.6);
  }
}

/**
 * Play the chime. The context is created lazily so a page load that starts
 * with the persisted preference already on (no toggle click, so no prime) can
 * still play once the browser lets audio run — see the gesture unlock in
 * ConfirmedChime. A suspended context is resumed and the chime plays on
 * resolution unless it has gone stale.
 */
export function playChime(): void {
  const Ctor = resolveAudioContextCtor();
  if (Ctor === null) return;
  audioContext ??= new Ctor();
  const ctx = audioContext;

  if (ctx.state === "running") {
    strike(ctx);
    return;
  }
  const queuedAtMs = Date.now();
  void ctx
    .resume()
    .then(() => {
      if (
        ctx.state === "running" &&
        Date.now() - queuedAtMs < RESUME_CHIME_MAX_AGE_MS
      ) {
        strike(ctx);
      }
    })
    .catch(() => undefined);
}

/**
 * Whether a stream event is a not-yet-seen confirmation worth chiming for.
 * Pure and side-effect free; the caller records the id after chiming so a
 * duplicate `confirmed` delta or a later `responding`/`resolved` for the same
 * event stays silent.
 */
export function isNewConfirmation(
  seenEventIds: ReadonlySet<string>,
  event: FieldStreamEvent,
): boolean {
  return (
    event.type === "event" &&
    event.payload.state === "confirmed" &&
    !seenEventIds.has(event.payload.id)
  );
}

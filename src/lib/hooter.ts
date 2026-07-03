/**
 * Warning "hooter" for the Command/Guard/Channels alarm. A short, harsh hi-lo
 * siren blast — meant to read as an emergency warning, not a soft notification.
 * Audio is opt-in (see use-sound) and the WebAudio context must be unlocked by
 * a user gesture, so we prime it from the toggle / first interaction and only
 * sound once primed. The repeating cadence is driven by use-alarm.
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

/** Create/resume the audio context from within a user gesture. Idempotent. */
export function primeHooter(): void {
  const Ctor = resolveAudioContextCtor();
  if (Ctor === null) return;
  audioContext ??= new Ctor();
  if (audioContext.state === "suspended") void audioContext.resume();
}

/* A resume() started outside a user gesture stays pending until the browser
   unlocks audio; past this age a late-resolving blast is stale noise. */
const RESUME_HOOTER_MAX_AGE_MS = 1_500;

function blast(ctx: AudioContext): void {
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  // Two urgent pulses so the blast reads as a hi-lo "hoo-er", with a dip
  // between them rather than a continuous tone.
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.33);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.38);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
  gain.connect(ctx.destination);

  // Harsh sawtooth timbre; high tone drops to a lower tone (siren couplet).
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.setValueAtTime(620, now + 0.34);
  osc.frequency.setValueAtTime(466, now + 0.36);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.74);
}

/**
 * Sound one hooter blast. The context is created lazily so a page that starts
 * with the persisted preference already on (no toggle click, so no prime) can
 * still sound once the browser lets audio run — see the gesture unlock in
 * ConfirmedAlarm. A suspended context is resumed and the blast sounds on
 * resolution unless it has gone stale.
 */
export function playHooter(): void {
  const Ctor = resolveAudioContextCtor();
  if (Ctor === null) return;
  audioContext ??= new Ctor();
  const ctx = audioContext;

  if (ctx.state === "running") {
    blast(ctx);
    return;
  }
  const queuedAtMs = Date.now();
  void ctx
    .resume()
    .then(() => {
      if (
        ctx.state === "running" &&
        Date.now() - queuedAtMs < RESUME_HOOTER_MAX_AGE_MS
      ) {
        blast(ctx);
      }
    })
    .catch(() => undefined);
}

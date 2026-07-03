import type { LiveStreamStatus } from "@/components/live-stream-provider";

/**
 * Pure state machine for the live-connection banner. The SSE dot in the top
 * bar always shows the raw status; this banner only surfaces the two moments
 * an operator must notice — the stream dropping, and it coming back — so a
 * life-critical console never silently goes stale.
 */
export type BannerTone = "lost" | "restored";

export interface BannerState {
  /** Whether a banner is shown at all. */
  visible: boolean;
  tone: BannerTone | null;
  /** True once an "open" connection has been observed at least once. */
  established: boolean;
}

export const INITIAL_BANNER_STATE: BannerState = {
  visible: false,
  tone: null,
  established: false,
};

/**
 * Advance the banner given the next stream status.
 *
 * - The initial `connecting` → `open` handshake shows nothing (first paint is
 *   not a "reconnect").
 * - Losing an already-established stream (`reconnecting`) shows the "lost"
 *   banner and holds it until the stream is back.
 * - Recovering from a loss shows the transient "restored" banner; the caller
 *   is responsible for dismissing it on a timer (see `RESTORED_DISMISS_MS`).
 */
export function reduceBanner(
  prev: BannerState,
  status: LiveStreamStatus,
): BannerState {
  if (status === "reconnecting") {
    // Only alarm once we had a working stream to lose.
    if (!prev.established) return prev;
    return { visible: true, tone: "lost", established: true };
  }

  if (status === "open") {
    if (!prev.established) {
      // First successful connection — no banner, just record it.
      return { visible: false, tone: null, established: true };
    }
    if (prev.tone === "lost") {
      return { visible: true, tone: "restored", established: true };
    }
    return prev;
  }

  // "connecting": initial or post-disconnect handshake — leave state as-is.
  return prev;
}

/** How long the transient "restored" banner stays up before auto-dismiss. */
export const RESTORED_DISMISS_MS = 4000;

export function dismissRestored(prev: BannerState): BannerState {
  if (prev.tone !== "restored") return prev;
  return { visible: false, tone: null, established: prev.established };
}

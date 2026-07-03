"use client";

import { useEffect, useReducer } from "react";

import type { LiveStreamStatus } from "@/components/live-stream-provider";
import { useLiveStream } from "@/hooks/use-live-stream";
import {
  INITIAL_BANNER_STATE,
  RESTORED_DISMISS_MS,
  type BannerState,
  dismissRestored,
  reduceBanner,
} from "@/lib/connection-banner";
import type { StreamEventType } from "@/stream/events";

// Status only — no event types, so the banner never re-renders on field deltas.
const NO_EVENT_TYPES: readonly StreamEventType[] = [];

type BannerAction = { kind: "status"; status: LiveStreamStatus } | { kind: "dismiss" };

function bannerReducer(prev: BannerState, action: BannerAction): BannerState {
  return action.kind === "dismiss"
    ? dismissRestored(prev)
    : reduceBanner(prev, action.status);
}

/**
 * Slim banner under the shell header announcing when the live stream drops and
 * when it recovers. The top-bar dot shows the raw status at all times; this
 * banner exists so an operator can't miss a stale console. Shares the page's
 * one EventSource via useLiveStream.
 */
export function ConnectionBanner() {
  const { status } = useLiveStream({ types: NO_EVENT_TYPES });

  const [state, dispatch] = useReducer(bannerReducer, INITIAL_BANNER_STATE);

  useEffect(() => {
    dispatch({ kind: "status", status });
  }, [status]);

  useEffect(() => {
    if (state.tone !== "restored") return;
    const timer = setTimeout(() => dispatch({ kind: "dismiss" }), RESTORED_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [state.tone]);

  if (!state.visible) return null;

  const lost = state.tone === "lost";

  return (
    <div
      role="status"
      aria-live="polite"
      data-tone={state.tone}
      className={`flex items-center justify-center gap-2 border-b px-4 py-2 text-xs font-medium sm:text-sm ${
        lost
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-success/40 bg-success/10 text-success"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${lost ? "bg-warning" : "bg-success"}`}
      />
      {lost
        ? "Live connection lost — reconnecting to the field stream…"
        : "Live connection restored."}
    </div>
  );
}

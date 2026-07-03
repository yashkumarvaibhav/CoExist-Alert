"use client";

import { useLiveStream } from "@/hooks/use-live-stream";
import type { StreamEventType } from "@/stream/events";

// Status only — subscribing to zero event types keeps the top bar from
// re-rendering on every field delta while still tracking the connection.
const NO_EVENT_TYPES: readonly StreamEventType[] = [];

const STATUS_META = {
  connecting: { label: "Connecting", dotClass: "bg-warning" },
  open: { label: "Live", dotClass: "bg-success" },
  reconnecting: { label: "Reconnecting", dotClass: "bg-warning" },
} as const;

/**
 * Live-connection indicator for the shell top bar: green dot while the SSE
 * stream is delivering, amber while (re)connecting — always with a text label.
 */
export function LiveStatus() {
  const { status } = useLiveStream({ types: NO_EVENT_TYPES });
  const meta = STATUS_META[status];

  return (
    <span
      role="status"
      title={`Live data stream: ${meta.label.toLowerCase()}`}
      className="flex h-11 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-muted"
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${meta.dotClass}`}
      />
      {meta.label}
    </span>
  );
}

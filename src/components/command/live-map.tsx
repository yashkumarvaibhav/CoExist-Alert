"use client";

import dynamic from "next/dynamic";

import type { LiveMapProps } from "@/components/command/live-map-inner";

// Leaflet touches window at setup — the map is client-only with a calm
// placeholder while the chunk loads.
const LiveMapInner = dynamic(() => import("@/components/command/live-map-inner"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="flex h-full w-full items-center justify-center bg-sidebar text-sm text-faint"
    >
      Loading map…
    </div>
  ),
});

export function LiveMap(props: LiveMapProps) {
  return <LiveMapInner {...props} />;
}

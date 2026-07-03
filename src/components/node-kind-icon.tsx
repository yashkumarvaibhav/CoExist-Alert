import type { NodeKind } from "@/domain/types";

export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  village_boundary: "Village boundary",
  rail_crossing: "Rail crossing",
  waterhole: "Waterhole",
};

/** Kind glyphs per the UI spec: house / rail / droplet, stroke-only SVG. */
export function NodeKindIcon({
  kind,
  className,
}: {
  kind: NodeKind;
  className?: string;
}) {
  const shared = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
  } as const;

  switch (kind) {
    case "village_boundary":
      return (
        <svg {...shared}>
          <path d="M4 11.5 12 4.5l8 7" />
          <path d="M6.5 10.5V19h11v-8.5" />
          <path d="M10.5 19v-5h3v5" />
        </svg>
      );
    case "rail_crossing":
      return (
        <svg {...shared}>
          <path d="M8 3v18M16 3v18" />
          <path d="M8 7.5h8M8 12h8M8 16.5h8" />
        </svg>
      );
    case "waterhole":
      return (
        <svg {...shared}>
          <path d="M12 3.5c3.5 4.4 6 7.4 6 10.5a6 6 0 1 1-12 0c0-3.1 2.5-6.1 6-10.5Z" />
        </svg>
      );
  }
}

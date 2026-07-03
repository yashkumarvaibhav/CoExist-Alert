import type { EventState, NodeStatus } from "@/domain/types";

/**
 * Status chip — the single way node health and event state render anywhere in
 * the UI. Status colors carry state (never interaction), and every chip pairs
 * its color with an icon + text label so meaning never rides on color alone.
 */

export type ChipStatus = NodeStatus | EventState;

type ChipIconName = "check" | "triangle" | "alert" | "arrow" | "slash";

const CHIP_META: Record<
  ChipStatus,
  { label: string; className: string; icon: ChipIconName }
> = {
  healthy: {
    label: "Healthy",
    className: "border-status-healthy/40 text-status-healthy",
    icon: "check",
  },
  degraded: {
    label: "Degraded",
    className: "border-status-degraded/40 text-status-degraded",
    icon: "triangle",
  },
  offline: {
    label: "Offline",
    className: "border-status-offline/40 text-status-offline",
    icon: "alert",
  },
  unconfirmed: {
    label: "Unconfirmed",
    className: "border-status-unconfirmed/40 text-status-unconfirmed",
    icon: "triangle",
  },
  confirmed: {
    label: "Confirmed",
    className: "border-status-confirmed/40 text-status-confirmed",
    icon: "alert",
  },
  responding: {
    label: "Responding",
    className: "border-status-advisory/40 text-status-advisory",
    icon: "arrow",
  },
  resolved: {
    label: "Resolved",
    className: "border-status-resolved/40 text-status-resolved",
    icon: "check",
  },
  expired: {
    label: "Expired",
    className: "border-line text-muted",
    icon: "slash",
  },
};

function ChipIcon({ icon }: { icon: ChipIconName }) {
  const shared = {
    "aria-hidden": true,
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;

  switch (icon) {
    case "check":
      return (
        <svg {...shared}>
          <path d="M4 12.5l5.5 5.5L20 6.5" />
        </svg>
      );
    case "triangle":
      return (
        <svg {...shared}>
          <path d="M12 3.5 2.5 20h19L12 3.5Z" />
          <path d="M12 10v4.5M12 17.5v.1" />
        </svg>
      );
    case "alert":
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.5v.1" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 12h6.5M12.5 9l3 3-3 3" />
        </svg>
      );
    case "slash":
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="9" />
          <path d="M6 6l12 12" />
        </svg>
      );
  }
}

export function StatusChip({ status }: { status: ChipStatus }) {
  const meta = CHIP_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium uppercase tracking-[0.06em] ${meta.className}`}
    >
      <ChipIcon icon={meta.icon} />
      {meta.label}
    </span>
  );
}

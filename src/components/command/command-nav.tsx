"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NodeKindIcon } from "@/components/node-kind-icon";
import type { NodeKind } from "@/domain/types";

export interface NavNode {
  id: string;
  name: string;
  kind: NodeKind;
}

/** Console glyphs matching the stroke-only node icons: map / list / chart. */
function ConsoleIcon({
  name,
  className,
}: {
  name: "dashboard" | "events" | "analytics";
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

  switch (name) {
    case "dashboard":
      return (
        <svg {...shared}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "events":
      return (
        <svg {...shared}>
          <path d="M8.5 6h12M8.5 12h12M8.5 18h12" />
          <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...shared}>
          <path d="M4 20.5V15M10 20.5V9.5M16 20.5V12M22 20.5V5.5" transform="translate(-1 0)" />
        </svg>
      );
  }
}

const CONSOLE_LINKS = [
  { href: "/command", label: "Dashboard", exact: true, icon: "dashboard" },
  { href: "/command/events", label: "Events", exact: false, icon: "events" },
  { href: "/command/analytics", label: "Analytics", exact: false, icon: "analytics" },
] as const;

function linkClass(active: boolean): string {
  return `flex min-h-11 items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors ${
    active
      ? "border-line-strong bg-accent-soft font-semibold text-ink"
      : "border-transparent text-body hover:bg-hover hover:text-ink"
  }`;
}

export function CommandNav({
  nodes,
  onNavigate,
}: {
  nodes: NavNode[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Command console" className="flex flex-col gap-6 p-4">
      <div>
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
          Console
        </p>
        <ul className="flex flex-col gap-0.5">
          {CONSOLE_LINKS.map((link) => {
            const active = isActive(link.href, link.exact);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={linkClass(active)}
                >
                  <ConsoleIcon name={link.icon} className="size-4 shrink-0" />
                  <span className="truncate">{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
          Sensor nodes
        </p>
        <ul className="flex flex-col gap-0.5">
          {nodes.map((node) => {
            const href = `/command/nodes/${node.id}`;
            const active = pathname === href;
            return (
              <li key={node.id}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={linkClass(active)}
                >
                  <NodeKindIcon kind={node.kind} className="size-4 shrink-0" />
                  <span className="truncate">{node.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

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

const CONSOLE_LINKS = [
  { href: "/command", label: "Dashboard", exact: true },
  { href: "/command/events", label: "Events", exact: false },
  { href: "/command/analytics", label: "Analytics", exact: false },
] as const;

function linkClass(active: boolean): string {
  return `flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
    active
      ? "bg-accent-soft font-medium text-accent"
      : "text-body hover:bg-hover hover:text-ink"
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
                  {link.label}
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

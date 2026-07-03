"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Role switcher — the POC stand-in for auth: one operator can jump between
 * the persona surfaces (command / guard / channels / demo). Production would
 * gate these behind Duo MFA instead.
 */
const ROLE_VIEWS = [
  { path: "/command", label: "Command" },
  { path: "/guard", label: "Guard" },
  { path: "/channels", label: "Channels" },
  { path: "/demo", label: "Demo" },
] as const;

export function RoleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const current =
    ROLE_VIEWS.find(
      (view) => pathname === view.path || pathname.startsWith(`${view.path}/`),
    )?.path ?? "/command";

  return (
    <label className="flex items-center">
      <span className="sr-only">Switch role view</span>
      <select
        value={current}
        onChange={(event) => router.push(event.target.value)}
        className="h-11 rounded-md border border-line bg-raised px-2 text-sm text-ink"
      >
        {ROLE_VIEWS.map((view) => (
          <option key={view.path} value={view.path}>
            {view.label}
          </option>
        ))}
      </select>
    </label>
  );
}

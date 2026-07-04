"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Role switcher — the POC stand-in for auth: one operator can jump between the
 * persona surfaces (command / guard / escalation tiers / channels / demo).
 * The escalation tiers are the same guard console targeted at a senior
 * responder via ?as=, so the ladder story is walkable in the demo. Production
 * would gate these behind Duo MFA instead.
 */
const ROLE_VIEWS = [
  { value: "/command", label: "Command" },
  { value: "/guard", label: "Guard (beat)" },
  { value: "/guard?as=guard-rrt-alpha", label: "Range officer" },
  { value: "/guard?as=district-duty-officer", label: "Duty officer" },
  { value: "/channels", label: "Channels" },
  { value: "/demo", label: "Demo" },
] as const;

export function RoleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Match on path + the responder (?as=) so the guard-based tiers resolve to
  // their own entries rather than all collapsing onto "Guard (beat)".
  const as = searchParams.get("as");
  const current =
    ROLE_VIEWS.find((view) => {
      const [path, query] = view.value.split("?");
      if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
      if (query === undefined) return path !== "/guard" || as === null;
      return query === `as=${as}`;
    })?.value ?? "/command";

  return (
    <label className="flex items-center">
      <span className="sr-only">Switch role view</span>
      <select
        value={current}
        onChange={(event) => router.push(event.target.value)}
        className="h-11 w-[6.25rem] rounded-md border border-line bg-raised px-2 text-sm text-ink sm:w-auto"
      >
        {ROLE_VIEWS.map((view) => (
          <option key={view.value} value={view.value}>
            {view.label}
          </option>
        ))}
      </select>
    </label>
  );
}

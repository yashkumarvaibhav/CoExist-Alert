"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { UserRole } from "@/auth/session";

/**
 * Account control: shows the views the signed-in role can reach and a sign-out
 * action. Backed by real auth — a guard sees only their console, command/admin
 * can switch across the persona surfaces (guard tiers via ?as=). Identity is
 * read from /api/auth/me so the surrounding shells need no session plumbing.
 */
const ROLE_VIEWS = [
  { value: "/command", label: "Command", roles: ["command", "admin"] },
  { value: "/guard", label: "Guard (beat)", roles: ["command", "admin", "guard"] },
  { value: "/guard?as=guard-rrt-alpha", label: "Range officer", roles: ["command", "admin"] },
  { value: "/guard?as=district-duty-officer", label: "Duty officer", roles: ["command", "admin"] },
  { value: "/channels", label: "Channels", roles: ["command", "admin", "control"] },
  { value: "/demo", label: "Demo", roles: ["admin"] },
] as const;

interface Me {
  role: UserRole;
  displayName: string;
}

export function RoleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? (res.json() as Promise<{ authenticated: boolean } & Me>) : null))
      .then((data) => {
        if (active && data && data.authenticated) {
          setMe({ role: data.role, displayName: data.displayName });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (me === null) return null;

  const views = ROLE_VIEWS.filter((view) => (view.roles as readonly string[]).includes(me.role));
  const as = searchParams.get("as");
  const current =
    views.find((view) => {
      const [path, query] = view.value.split("?");
      if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
      if (query === undefined) return path !== "/guard" || as === null;
      return query === `as=${as}`;
    })?.value ?? views[0]?.value;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1.5">
      {views.length > 1 && (
        <label className="flex items-center">
          <span className="sr-only">Switch role view</span>
          <select
            value={current}
            onChange={(event) => router.push(event.target.value)}
            className="h-11 w-[6.25rem] rounded-md border border-line bg-raised px-2 text-sm text-ink sm:w-auto"
          >
            {views.map((view) => (
              <option key={view.value} value={view.value}>
                {view.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        title={`Signed in as ${me.displayName} — sign out`}
        className="h-11 rounded-md border border-line bg-raised px-2.5 text-sm text-body hover:bg-hover"
      >
        <span className="hidden sm:inline">Sign out</span>
        <span className="sm:hidden" aria-hidden>
          ⎋
        </span>
        <span className="sr-only">Sign out ({me.displayName})</span>
      </button>
    </div>
  );
}

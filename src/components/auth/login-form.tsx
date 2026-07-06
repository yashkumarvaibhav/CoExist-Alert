"use client";

import { useState } from "react";

/** Read/respond demo accounts shown for one-click sign-in. Admin is not listed:
 * the field-driving controls stay behind a credential only the operator holds. */
const DEMO_ACCOUNTS = [
  { username: "commander", label: "Command Center", hint: "Full command dashboard" },
  { username: "guard", label: "Beat Officer R. Sharma", hint: "Guard response console" },
  { username: "range", label: "Range RRT Alpha", hint: "Escalation-tier console" },
  { username: "control", label: "NFR Section Control", hint: "Rail channels view" },
] as const;
const DEMO_PASSWORD = "coexist-demo";

function safeLocalPath(path: string | null | undefined): string | null {
  if (typeof path !== "string") return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

export function LoginForm({ next }: { next: string | null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(user: string, pass: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      if (!res.ok) {
        setError("Invalid username or password.");
        setPending(false);
        return;
      }
      const data = (await res.json()) as { home?: string };
      window.location.assign(safeLocalPath(next) ?? safeLocalPath(data.home) ?? "/command");
    } catch {
      setError("Sign-in failed. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="font-serif text-2xl text-ink">Sign in</h2>
        <p className="mt-1 text-sm text-muted">
          CoExist Alert consoles require an account. Access is role-based — Cisco
          Duo MFA can guard the operations console when configured.
        </p>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(username, password);
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-body">Username</span>
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-11 rounded-md border border-line bg-raised px-3 text-ink"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-body">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 rounded-md border border-line bg-raised px-3 text-ink"
            required
          />
        </label>
        {error !== null && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-md bg-accent font-medium text-accent-contrast hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="rounded-lg border border-line bg-sidebar p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Demo accounts — one-click sign-in
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.username}>
              <button
                type="button"
                disabled={pending}
                onClick={() => void submit(account.username, DEMO_PASSWORD)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-raised px-3 py-2 text-left text-sm hover:bg-hover disabled:opacity-60"
              >
                <span>
                  <span className="font-medium text-ink">{account.label}</span>
                  <span className="block text-xs text-muted">{account.hint}</span>
                </span>
                <span className="font-mono text-xs text-faint">{account.username}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-faint">
          Password for all demo accounts: <span className="font-mono">{DEMO_PASSWORD}</span>.
          The operations (admin) console is not listed.
        </p>
      </div>
    </div>
  );
}

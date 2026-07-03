"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Shared error surface for App Router `error.tsx` boundaries. A life-critical
 * console must never collapse to a blank screen — every boundary shows what
 * failed, a retry, and a way back to the dashboard.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "This view failed to load. The field pipeline is unaffected — retry to fetch the latest state.",
  error,
  reset,
  showHomeLink = true,
}: {
  title?: string;
  description?: string;
  error?: Error & { digest?: string };
  reset?: () => void;
  showHomeLink?: boolean;
}) {
  useEffect(() => {
    if (error) console.error(error);
  }, [error]);

  return (
    <section
      role="alert"
      className="mx-auto max-w-xl rounded-lg border border-danger/40 bg-raised px-6 py-10 text-center"
    >
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-danger">
        Error
      </p>
      <h1 className="mt-2 font-serif text-2xl text-ink sm:text-3xl">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
        {description}
      </p>
      {error?.digest && (
        <p className="mt-3 font-mono text-xs text-faint">Ref: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {reset && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
          >
            Try again
          </button>
        )}
        {showHomeLink && (
          <Link
            href="/command"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-sm font-medium text-ink transition-colors hover:bg-hover"
          >
            Back to dashboard
          </Link>
        )}
      </div>
    </section>
  );
}

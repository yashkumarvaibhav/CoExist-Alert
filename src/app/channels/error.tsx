"use client";

import { ErrorState } from "@/components/error-state";

export default function ChannelsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-16">
      <ErrorState error={error} reset={reset} />
    </div>
  );
}

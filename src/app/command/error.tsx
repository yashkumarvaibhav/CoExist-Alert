"use client";

import { ErrorState } from "@/components/error-state";

export default function CommandError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="This console view failed to load"
      description="The live field pipeline keeps running — retry to re-read the current state."
      error={error}
      reset={reset}
    />
  );
}

import type { Metadata } from "next";

import { StandaloneShell } from "@/components/standalone-shell";

export const metadata: Metadata = {
  title: "Guard view — CoExist Alert",
};

export default function GuardViewPage() {
  return (
    <StandaloneShell>
      <header>
        <h1 className="text-3xl">Guard view</h1>
        <p className="mt-1 text-sm text-muted">
          Mobile response console for beat officers.
        </p>
      </header>
      <section className="rounded-lg border border-line bg-raised px-6 py-12 text-center text-sm text-muted">
        The acknowledge-and-respond flow is being prepared. Confirmed events
        already dispatch guard alerts through the alert pipeline.
      </section>
    </StandaloneShell>
  );
}

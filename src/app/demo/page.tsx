import type { Metadata } from "next";

import { StandaloneShell } from "@/components/standalone-shell";

export const metadata: Metadata = {
  title: "Demo control panel — CoExist Alert",
  robots: { index: false },
};

export default function DemoPanelPage() {
  return (
    <StandaloneShell>
      <header>
        <h1 className="text-3xl">Demo control panel</h1>
        <p className="mt-1 text-sm text-muted">
          Drives the simulated field for demonstrations.
        </p>
      </header>
      <section className="rounded-lg border border-line bg-raised px-6 py-12 text-center text-sm text-muted">
        Scenario controls are being prepared. Scripted scenarios can currently
        be triggered through the demo API.
      </section>
    </StandaloneShell>
  );
}

import type { Metadata } from "next";

import { StandaloneShell } from "@/components/standalone-shell";

export const metadata: Metadata = {
  title: "Field channels — CoExist Alert",
};

export default function ChannelsViewPage() {
  return (
    <StandaloneShell>
      <header>
        <h1 className="text-3xl">Field channels</h1>
        <p className="mt-1 text-sm text-muted">
          Villager phone feed and rail-control advisory strip.
        </p>
      </header>
      <section className="rounded-lg border border-line bg-raised px-6 py-12 text-center text-sm text-muted">
        The villager phone frames and rail-control panel are being prepared.
        Confirmed events already dispatch geofenced channel alerts through the
        alert pipeline.
      </section>
    </StandaloneShell>
  );
}

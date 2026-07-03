import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Analytics & hotspots — CoExist Alert",
};

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Analytics &amp; hotspots</h1>
        <p className="mt-1 text-sm text-muted">
          Reliability KPIs and time-of-day risk analysis for the corridor.
        </p>
      </header>

      <section className="rounded-lg border border-line bg-raised px-6 py-12 text-center">
        <p className="mx-auto max-w-md text-sm text-muted">
          The hotspot heatmap and reliability KPI cards are being assembled.
          Event history is already recording — see the{" "}
          <Link
            href="/command/events"
            className="font-medium text-accent hover:text-accent-hover"
          >
            events log
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

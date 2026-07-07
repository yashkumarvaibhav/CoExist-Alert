import { HonestyChip } from "@/components/honesty-chip";
import type { Outage } from "@/domain/types";
import { formatElapsed, formatIstDateTime } from "@/lib/time";

interface HealthHistoryProps {
  batterySeries: Array<number | null>;
  linkSeries: Array<number | null>;
  outageBands: Outage[];
  ledgerOutages: Outage[];
  fromIso: string;
  toIso: string;
}

const CHART = {
  width: 680,
  height: 220,
  left: 46,
  right: 16,
  top: 18,
  bottom: 38,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function segmentPoints(series: Array<number | null>): string[] {
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const step = series.length > 1 ? plotWidth / (series.length - 1) : plotWidth;
  const segments: string[] = [];
  let current: string[] = [];

  series.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    const x = CHART.left + index * step;
    const y = CHART.top + (1 - clamp01(value / 100)) * plotHeight;
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));
  return segments;
}

function outageBands(outages: Outage[], fromIso: string, toIso: string) {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const span = Math.max(1, toMs - fromMs);
  const plotWidth = CHART.width - CHART.left - CHART.right;

  return outages.map((outage) => {
    const start = clamp01((new Date(outage.startedAt).getTime() - fromMs) / span);
    const end = clamp01(
      ((outage.endedAt === null ? toMs : new Date(outage.endedAt).getTime()) -
        fromMs) /
        span,
    );
    return {
      id: outage.id,
      x: CHART.left + start * plotWidth,
      width: Math.max(2, (end - start) * plotWidth),
    };
  });
}

function hasSamples(series: Array<number | null>): boolean {
  return series.some((value) => value !== null);
}

function durationLabel(outage: Outage, fallbackEndIso: string): string {
  const endIso = outage.endedAt ?? fallbackEndIso;
  const seconds =
    (new Date(endIso).getTime() - new Date(outage.startedAt).getTime()) / 1_000;
  const suffix = outage.endedAt === null ? " so far" : "";
  return `${formatElapsed(seconds)}${suffix}`;
}

export function NodeHealthHistory({
  batterySeries,
  linkSeries,
  outageBands: outageBandRows,
  ledgerOutages,
  fromIso,
  toIso,
}: HealthHistoryProps) {
  const batterySegments = segmentPoints(batterySeries);
  const linkSegments = segmentPoints(linkSeries);
  const bands = outageBands(outageBandRows, fromIso, toIso);
  const hasChartSamples = hasSamples(batterySeries) || hasSamples(linkSeries);
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;

  return (
    <section
      aria-labelledby="node-health-history-heading"
      className="rounded-lg border border-line bg-raised"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-6">
        <div>
          <h2 id="node-health-history-heading" className="text-base font-medium">
            24 h battery + link health
          </h2>
          <p className="mt-0.5 text-xs text-faint">
            Reliability model: ThousandEyes synthetic tests
          </p>
        </div>
        <HonestyChip mode="simulated" />
      </div>

      <div className="px-2 py-4 sm:px-6">
        {hasChartSamples ? (
          <figure className="min-w-0">
            <svg
              role="img"
              aria-labelledby="node-health-chart-title node-health-chart-desc"
              viewBox={`0 0 ${CHART.width} ${CHART.height}`}
              className="h-auto w-full overflow-visible"
            >
              <title id="node-health-chart-title">24 hour battery and link history</title>
              <desc id="node-health-chart-desc">
                Battery and link quality percentages, with shaded outage
                intervals.
              </desc>

              {[0, 50, 100].map((tick) => {
                const y = CHART.top + (1 - tick / 100) * plotHeight;
                return (
                  <g key={tick}>
                    <line
                      x1={CHART.left}
                      x2={CHART.left + plotWidth}
                      y1={y}
                      y2={y}
                      stroke="var(--line)"
                      strokeWidth="1"
                    />
                    <text
                      x={CHART.left - 10}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-faint text-[10px]"
                    >
                      {tick}%
                    </text>
                  </g>
                );
              })}

              {bands.map((band) => (
                <rect
                  key={band.id}
                  x={band.x}
                  y={CHART.top}
                  width={band.width}
                  height={plotHeight}
                  fill="var(--status-offline)"
                  opacity="0.08"
                />
              ))}

              <line
                x1={CHART.left}
                x2={CHART.left + plotWidth}
                y1={CHART.top + plotHeight}
                y2={CHART.top + plotHeight}
                stroke="var(--line)"
                strokeWidth="1"
              />

              {batterySegments.map((points) => (
                <polyline
                  key={`battery-${points}`}
                  points={points}
                  fill="none"
                  stroke="var(--status-degraded)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.4"
                />
              ))}
              {linkSegments.map((points) => (
                <polyline
                  key={`link-${points}`}
                  points={points}
                  fill="none"
                  stroke="var(--status-advisory)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.4"
                />
              ))}

              <text
                x={CHART.left}
                y={CHART.height - 12}
                className="fill-faint text-[10px]"
              >
                -24 h
              </text>
              <text
                x={CHART.left + plotWidth}
                y={CHART.height - 12}
                textAnchor="end"
                className="fill-faint text-[10px]"
              >
                now
              </text>
            </svg>
            <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-0.5 w-5 bg-status-degraded"
                />
                Battery
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-0.5 w-5 bg-status-advisory"
                />
                Link quality
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-3 w-5 bg-status-offline/10"
                />
                Outage band
              </span>
            </figcaption>
          </figure>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted">
            No health samples in this 24 h window.
          </p>
        )}
      </div>

      <div className="border-t border-line">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <h3 className="font-sans text-sm font-medium tracking-normal">
            Outage ledger
          </h3>
          <span className="text-xs text-faint">Blind-spot accountability</span>
        </div>
        {ledgerOutages.length === 0 ? (
          <p className="px-4 pb-5 text-sm font-medium text-status-resolved sm:px-6">
            No blind spots recorded — 100% covered.
          </p>
        ) : (
          <div
            className="overflow-x-auto"
            tabIndex={0}
            aria-label="Outage ledger table"
          >
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-y border-line text-left text-xs uppercase tracking-[0.08em] text-faint">
                  <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">
                    Started
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Ended
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Duration
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Ops alerted
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ledgerOutages.map((outage) => (
                  <tr key={outage.id}>
                    <td className="tnum px-4 py-2.5 text-body sm:px-6">
                      {formatIstDateTime(outage.startedAt)} IST
                    </td>
                    <td className="tnum px-4 py-2.5 text-body">
                      {outage.endedAt === null
                        ? "Open"
                        : `${formatIstDateTime(outage.endedAt)} IST`}
                    </td>
                    <td className="tnum px-4 py-2.5 text-ink">
                      {durationLabel(outage, toIso)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${
                          outage.opsAlerted
                            ? "border-status-resolved/40 text-status-resolved"
                            : "border-status-degraded/40 text-status-degraded"
                        }`}
                      >
                        {outage.opsAlerted ? "Yes" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

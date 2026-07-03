import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";

import { HonestyChip } from "@/components/honesty-chip";
import { NodeKindIcon } from "@/components/node-kind-icon";
import {
  DAWN_HOURS,
  DUSK_HOURS,
  formatHourLabel,
  HOTSPOT_HOURS,
  type HotspotAnalyticsSnapshot,
  type HotspotCell,
} from "@/lib/analytics";
import { formatIstDateTime } from "@/lib/time";

const CHART = {
  width: 1040,
  left: 190,
  right: 24,
  top: 60,
  rowStep: 48,
  bottom: 48,
};

function hourRangeLabel(hours: readonly number[]): string {
  const first = hours[0] ?? 0;
  const last = hours[hours.length - 1] ?? first;
  return `${formatHourLabel(first)}-${String(last).padStart(2, "0")}:59`;
}

function cellLabel(cell: HotspotCell, nodeName: string): string {
  const plural = cell.count === 1 ? "event" : "events";
  return `${nodeName}, ${formatHourLabel(cell.hour)} IST, ${cell.count} ${plural}`;
}

function cellClassName(cell: HotspotCell, peak: HotspotAnalyticsSnapshot["peak"]): string {
  if (
    peak !== null &&
    cell.nodeId === peak.nodeId &&
    cell.hour === peak.hour &&
    cell.count === peak.count
  ) {
    return "stroke-ink";
  }
  return "stroke-line";
}

export function HotspotHeatmap({
  snapshot,
}: {
  snapshot: HotspotAnalyticsSnapshot;
}) {
  const chartHeight =
    CHART.top + Math.max(1, snapshot.rows.length) * CHART.rowStep + CHART.bottom;
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const xScale = scaleBand<number>({
    domain: HOTSPOT_HOURS,
    range: [0, plotWidth],
    padding: 0.08,
  });
  const yScale = scaleBand<string>({
    domain: snapshot.rows.map((row) => row.nodeId),
    range: [0, Math.max(1, snapshot.rows.length) * CHART.rowStep],
    padding: 0.18,
  });
  const opacityScale = scaleLinear<number>({
    domain: [1, Math.max(1, snapshot.maxCount)],
    range: [0.26, 0.95],
  });
  const cellWidth = xScale.bandwidth();
  const cellHeight = yScale.bandwidth();
  const dawnX = xScale(DAWN_HOURS[0]) ?? 0;
  const duskX = xScale(DUSK_HOURS[0]) ?? 0;
  const dawnWidth =
    (xScale(DAWN_HOURS[DAWN_HOURS.length - 1]) ?? dawnX) - dawnX + cellWidth;
  const duskWidth =
    (xScale(DUSK_HOURS[DUSK_HOURS.length - 1]) ?? duskX) - duskX + cellWidth;

  return (
    <section
      aria-labelledby="hotspot-heading"
      className="max-w-full overflow-hidden rounded-lg border border-line bg-raised"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="hotspot-heading" className="text-base font-medium">
              Hotspot heatmap
            </h2>
            <HonestyChip mode="simulated" />
          </div>
          <p className="mt-1 text-xs text-faint">
            Node × hour-of-day, confirmed events only · Splunk-style aggregation
          </p>
        </div>
        <p className="max-w-md text-xs text-muted">
          {snapshot.window.label} window · {formatIstDateTime(snapshot.window.fromIso)} to{" "}
          {formatIstDateTime(snapshot.window.toIso)} IST · sample n={snapshot.sampleSize}
        </p>
      </div>

      {snapshot.sampleSize === 0 ? (
        <div className="px-4 py-14 text-center sm:px-6">
          <p className="text-sm font-medium text-ink">
            No confirmed events in window.
          </p>
          <p className="mt-1 text-xs text-muted">
            Analytics stay empty until confirmed events exist; zeros are not
            substituted for missing evidence.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 border-b border-line px-4 py-4 sm:grid-cols-3 sm:px-6">
            <div className="min-w-0 rounded-md border border-line bg-page px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.1em] text-faint">
                Peak cell
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                {snapshot.peak === null
                  ? "No peak"
                  : `${snapshot.peak.nodeName} · ${formatHourLabel(snapshot.peak.hour)} IST`}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {snapshot.peak === null ? "n=0" : `${snapshot.peak.count} confirmed`}
              </p>
            </div>
            <div className="min-w-0 rounded-md border border-line bg-page px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.1em] text-faint">
                Dawn band
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                {hourRangeLabel(DAWN_HOURS)} IST
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {snapshot.dawnCount} confirmed events
              </p>
            </div>
            <div className="min-w-0 rounded-md border border-line bg-page px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.1em] text-faint">
                Dusk band
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                {hourRangeLabel(DUSK_HOURS)} IST
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {snapshot.duskCount} confirmed events
              </p>
            </div>
          </div>

          <div className="px-1 py-4 sm:px-6">
            <figure>
              <svg
                role="img"
                aria-labelledby="hotspot-chart-title hotspot-chart-desc"
                viewBox={`0 0 ${CHART.width} ${chartHeight}`}
                className="block h-auto w-full max-w-full overflow-hidden"
              >
                <title id="hotspot-chart-title">
                  {snapshot.window.label} node by hour hotspot heatmap
                </title>
                <desc id="hotspot-chart-desc">
                  Confirmed event counts by sensor node and IST hour, with
                  dawn and dusk patrol windows annotated.
                </desc>

                <Group left={CHART.left} top={CHART.top}>
                  <rect
                    x={dawnX}
                    y={-22}
                    width={dawnWidth}
                    height={snapshot.rows.length * CHART.rowStep + 16}
                    rx={8}
                    fill="var(--warning)"
                    opacity={0.08}
                  />
                  <rect
                    x={duskX}
                    y={-22}
                    width={duskWidth}
                    height={snapshot.rows.length * CHART.rowStep + 16}
                    rx={8}
                    fill="var(--warning)"
                    opacity={0.08}
                  />

                  <text
                    x={dawnX + dawnWidth / 2}
                    y={-34}
                    textAnchor="middle"
                    className="fill-faint text-[10px] uppercase tracking-[0.08em]"
                  >
                    Dawn
                  </text>
                  <text
                    x={duskX + duskWidth / 2}
                    y={-34}
                    textAnchor="middle"
                    className="fill-faint text-[10px] uppercase tracking-[0.08em]"
                  >
                    Dusk
                  </text>

                  {HOTSPOT_HOURS.map((hour) => {
                    const x = xScale(hour) ?? 0;
                    const showLabel = hour % 3 === 0;
                    return (
                      <g key={`hour-${hour}`}>
                        <line
                          x1={x + cellWidth / 2}
                          x2={x + cellWidth / 2}
                          y1={0}
                          y2={snapshot.rows.length * CHART.rowStep}
                          stroke="var(--line)"
                          strokeWidth={1}
                        />
                        {showLabel ? (
                          <text
                            x={x + cellWidth / 2}
                            y={-12}
                            textAnchor="middle"
                            className="fill-faint text-[10px]"
                          >
                            {String(hour).padStart(2, "0")}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}

                  {snapshot.rows.map((row) => {
                    const y = yScale(row.nodeId) ?? 0;
                    return (
                      <g key={row.nodeId}>
                        <text
                          x={-18}
                          y={y + cellHeight / 2 + 4}
                          textAnchor="end"
                          className="fill-ink text-[12px] font-medium"
                        >
                          {row.nodeName}
                        </text>
                        {row.cells.map((cell) => {
                          const x = xScale(cell.hour) ?? 0;
                          const opacity =
                            cell.count === 0 ? 1 : opacityScale(cell.count);
                          return (
                            <rect
                              key={`${cell.nodeId}-${cell.hour}`}
                              x={x}
                              y={y}
                              width={cellWidth}
                              height={cellHeight}
                              rx={6}
                              fill={cell.count === 0 ? "var(--hover)" : "var(--info)"}
                              opacity={opacity}
                              className={cellClassName(cell, snapshot.peak)}
                              strokeWidth={
                                snapshot.peak !== null &&
                                cell.nodeId === snapshot.peak.nodeId &&
                                cell.hour === snapshot.peak.hour
                                  ? 2
                                  : 1
                              }
                            >
                              <title>{cellLabel(cell, row.nodeName)}</title>
                            </rect>
                          );
                        })}
                      </g>
                    );
                  })}

                  <text
                    x={0}
                    y={snapshot.rows.length * CHART.rowStep + 24}
                    className="fill-faint text-[10px]"
                  >
                    00:00 IST
                  </text>
                  <text
                    x={plotWidth}
                    y={snapshot.rows.length * CHART.rowStep + 24}
                    textAnchor="end"
                    className="fill-faint text-[10px]"
                  >
                    23:00 IST
                  </text>
                </Group>
              </svg>
              <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-3 text-xs text-muted sm:px-0">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-3 w-5 rounded-sm bg-info/25"
                  />
                  Lower count
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-3 w-5 rounded-sm bg-info"
                  />
                  Higher count
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-3 w-5 rounded-sm bg-warning/10"
                  />
                  Dawn/dusk patrol bands
                </span>
              </figcaption>
            </figure>
          </div>

          <div className="border-t border-line px-4 py-4 sm:px-6">
            <h3 className="font-sans text-sm font-medium tracking-normal">
              Node summaries
            </h3>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {snapshot.rows.map((row) => (
                <div
                  key={row.nodeId}
                  className="min-w-0 rounded-md border border-line bg-page px-3 py-3"
                >
                  <div className="flex items-center gap-2">
                    <NodeKindIcon
                      kind={row.kind}
                      className="h-5 w-5 shrink-0 text-muted"
                    />
                    <p className="text-sm font-medium text-ink">{row.nodeName}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {row.total} confirmed in window · peak{" "}
                    {row.peakHour === null ? "not available" : `${formatHourLabel(row.peakHour)} IST`}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="sr-only">
            <table>
              <caption>Hotspot heatmap data table</caption>
              <thead>
                <tr>
                  <th scope="col">Node</th>
                  {HOTSPOT_HOURS.map((hour) => (
                    <th key={hour} scope="col">
                      {formatHourLabel(hour)} IST
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.map((row) => (
                  <tr key={row.nodeId}>
                    <th scope="row">{row.nodeName}</th>
                    {row.cells.map((cell) => (
                      <td key={`${cell.nodeId}-${cell.hour}`}>{cell.count}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

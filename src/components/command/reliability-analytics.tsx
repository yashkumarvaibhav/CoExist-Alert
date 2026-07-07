import Link from "next/link";

import { HonestyChip } from "@/components/honesty-chip";
import {
  ANALYTICS_WINDOWS,
  type AnalyticsWindowKey,
  type ReliabilityAnalyticsSnapshot,
  type ReliabilityCard,
  type TrendPoint,
} from "@/lib/analytics";

const WINDOW_LABELS: Record<AnalyticsWindowKey, string> = {
  "30d": "30 d",
  "7d": "7 d",
  "1h": "1 h",
};

const CHART = {
  width: 680,
  height: 160,
  left: 38,
  right: 16,
  top: 18,
  bottom: 30,
};

function formatTrendValue(value: number, unit: "count" | "seconds"): string {
  if (unit === "count") return String(Math.round(value));
  if (value < 60) return `${Math.round(value)}s`;
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
}

function windowHref(key: AnalyticsWindowKey): string {
  return key === "30d" ? "/command/analytics" : `/command/analytics?window=${key}`;
}

function KpiCard({ card }: { card: ReliabilityCard }) {
  return (
    <article
      aria-label={card.label}
      className="flex min-w-0 flex-col rounded-md border border-line bg-page px-4 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
          {card.label}
        </p>
        <span className="rounded-sm border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-faint">
          {card.windowLabel}
        </span>
      </div>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          card.insufficient ? "text-muted" : "text-ink"
        }`}
      >
        {card.value}
      </p>
      <p className="mt-1 text-xs text-muted">{card.sampleLabel}</p>
      <p className="mt-3 text-xs leading-relaxed text-faint">{card.definition}</p>

      {card.rows === undefined ? null : (
        <div className="mt-4 grid gap-1.5">
          {card.rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="min-w-0 truncate text-muted">{row.label}</span>
              <span
                className={`shrink-0 font-medium tabular-nums ${
                  row.insufficient ? "text-faint" : "text-ink"
                }`}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function trendTableCaption(title: string): string {
  return `${title} data table`;
}

function TrendChart({
  title,
  description,
  points,
  unit,
}: {
  title: string;
  description: string;
  points: TrendPoint[];
  unit: "count" | "seconds";
}) {
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  const maxValue = Math.max(1, ...values);
  const step = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
  const bars = points.map((point, index) => {
    const value = point.value ?? 0;
    const height = (value / maxValue) * plotHeight;
    return {
      x: CHART.left + index * step - Math.max(3, step * 0.32) / 2,
      y: CHART.top + plotHeight - height,
      width: Math.max(3, Math.min(18, step * 0.64)),
      height,
      value,
      point,
    };
  });
  const linePoints = points
    .map((point, index) => {
      if (point.value === null) return null;
      const x = CHART.left + index * step;
      const y = CHART.top + (1 - point.value / maxValue) * plotHeight;
      return { x, y, point };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null);
  const linePath =
    linePoints.length === 0
      ? ""
      : linePoints
          .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
          .join(" ");
  const hasSamples = values.length > 0;
  const chartId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <section className="min-w-0 rounded-md border border-line bg-page px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-sans text-sm font-medium tracking-normal text-ink">
            {title}
          </h3>
          <p className="mt-1 text-xs text-faint">{description}</p>
        </div>
        <span className="text-xs text-muted">
          sample n={points.reduce((sum, point) => sum + point.sampleSize, 0)}
        </span>
      </div>

      {hasSamples ? (
        <figure className="mt-3">
          <svg
            role="img"
            aria-labelledby={`${chartId}-title ${chartId}-desc`}
            viewBox={`0 0 ${CHART.width} ${CHART.height}`}
            className="block h-auto w-full max-w-full overflow-hidden"
          >
            <title id={`${chartId}-title`}>{title}</title>
            <desc id={`${chartId}-desc`}>{description}</desc>
            {[0, maxValue].map((tick) => {
              const y = CHART.top + (1 - tick / maxValue) * plotHeight;
              return (
                <g key={tick}>
                  <line
                    x1={CHART.left}
                    x2={CHART.left + plotWidth}
                    y1={y}
                    y2={y}
                    stroke="var(--line)"
                    strokeWidth={1}
                  />
                  <text
                    x={CHART.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-faint text-[10px]"
                  >
                    {formatTrendValue(tick, unit)}
                  </text>
                </g>
              );
            })}
            {unit === "count"
              ? bars.map((bar) => (
                  <rect
                    key={`${bar.point.fromIso}-${bar.point.toIso}`}
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={Math.max(1, bar.height)}
                    rx={3}
                    fill="var(--info)"
                    opacity={bar.value === 0 ? 0.16 : 0.78}
                  >
                    <title>
                      {`${bar.point.label}: ${formatTrendValue(bar.value, unit)}`}
                    </title>
                  </rect>
                ))
              : null}
            {unit === "seconds" && linePath !== "" ? (
              <path
                d={linePath}
                fill="none"
                stroke="var(--info)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.4}
              />
            ) : null}
            {unit === "seconds"
              ? linePoints.map((point) => (
                  <circle
                    key={`${point.point.fromIso}-${point.point.toIso}`}
                    cx={point.x}
                    cy={point.y}
                    r={3}
                    fill="var(--info)"
                  >
                    <title>
                      {`${point.point.label}: ${formatTrendValue(
                        point.point.value ?? 0,
                        unit,
                      )}`}
                    </title>
                  </circle>
                ))
              : null}
            <text
              x={CHART.left}
              y={CHART.height - 10}
              className="fill-faint text-[10px]"
            >
              {points[0]?.label ?? "start"}
            </text>
            <text
              x={CHART.left + plotWidth}
              y={CHART.height - 10}
              textAnchor="end"
              className="fill-faint text-[10px]"
            >
              {points.at(-1)?.label ?? "end"}
            </text>
          </svg>
          <figcaption className="mt-2 text-xs text-muted">
            Null gaps are left blank; no zero is substituted for missing samples.
          </figcaption>
        </figure>
      ) : (
        <p className="mt-4 rounded-md border border-line bg-raised px-3 py-6 text-center text-sm text-muted">
          No confirmed events in window.
        </p>
      )}

      <div className="sr-only">
        <table>
          <caption>{trendTableCaption(title)}</caption>
          <thead>
            <tr>
              <th scope="col">Window</th>
              <th scope="col">Value</th>
              <th scope="col">Sample</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={`${point.fromIso}-${point.toIso}`}>
                <th scope="row">{point.label}</th>
                <td>
                  {point.value === null
                    ? "No sample"
                    : formatTrendValue(point.value, unit)}
                </td>
                <td>{point.sampleSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AnalyticsWindowSelector({
  active,
}: {
  active: AnalyticsWindowKey;
}) {
  return (
    <nav
      aria-label="Analytics window"
      className="inline-flex rounded-md border border-line bg-raised p-1"
    >
      {ANALYTICS_WINDOWS.map((key) => (
        <Link
          key={key}
          href={windowHref(key)}
          aria-current={active === key ? "page" : undefined}
          className={`min-h-10 rounded-sm px-3 py-2 text-sm font-medium ${
            active === key
              ? "bg-accent text-accent-contrast"
              : "text-muted hover:bg-hover hover:text-ink"
          }`}
        >
          {WINDOW_LABELS[key]}
        </Link>
      ))}
    </nav>
  );
}

export function ReliabilityAnalytics({
  snapshot,
}: {
  snapshot: ReliabilityAnalyticsSnapshot;
}) {
  return (
    <section
      aria-labelledby="reliability-heading"
      className="rounded-lg border border-line bg-raised"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="reliability-heading" className="text-base font-medium">
              Reliability KPIs
            </h2>
            <HonestyChip mode="simulated" />
          </div>
          <p className="mt-1 text-xs text-faint">
            Metrics engine output for delivery, response and network reliability.
          </p>
        </div>
        <p className="max-w-md text-xs text-muted">
          Every card states its definition, window and sample size; insufficient
          samples render n &lt; 5.
        </p>
      </div>

      <div className="grid gap-3 border-b border-line px-4 py-4 md:grid-cols-2 xl:grid-cols-5 sm:px-6">
        {snapshot.cards.map((card) => (
          <KpiCard key={card.id} card={card} />
        ))}
      </div>

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-2 sm:px-6">
        <TrendChart
          title="Events/day trend"
          description="Confirmed events per rolling day in the selected window."
          points={snapshot.eventTrend}
          unit="count"
        />
        <TrendChart
          title="Response-time trend"
          description="Median seconds from confirmation to first acknowledgement."
          points={snapshot.responseTrend}
          unit="seconds"
        />
      </div>
    </section>
  );
}

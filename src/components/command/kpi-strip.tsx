/**
 * KPI stat tiles — presentational only, values computed server-side. Honesty
 * rule: an insufficient sample renders "n < 5", never a made-up number.
 * Values are sans + proportional figures (display size); labels sentence case.
 */

export interface KpiTileData {
  label: string;
  value: string;
  sub: string;
  insufficient?: boolean;
}

export function KpiStrip({ tiles }: { tiles: KpiTileData[] }) {
  return (
    <section
      aria-label="Key performance indicators"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-line bg-raised px-4 py-3"
        >
          <p className="text-[11px] uppercase tracking-[0.1em] text-faint">
            {tile.label}
          </p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              tile.insufficient ? "text-muted" : "text-ink"
            }`}
          >
            {tile.value}
          </p>
          <p className="mt-0.5 text-xs text-faint">{tile.sub}</p>
        </div>
      ))}
    </section>
  );
}

export function HonestyChip({ mode }: { mode: "simulated" | "live" }) {
  const isLive = mode === "live";
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${
        isLive
          ? "border-live-chip/40 text-live-chip"
          : "border-sim-chip/40 text-sim-chip"
      }`}
    >
      {isLive ? "LIVE" : "SIMULATED"}
    </span>
  );
}

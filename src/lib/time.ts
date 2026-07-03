/**
 * IST rendering helpers — all UI times display in Asia/Kolkata. IST has no
 * daylight saving, so a fixed +05:30 shift on UTC is exact (same approach as
 * the domain metrics engine).
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function toIst(iso: string): Date {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "HH:MM:SS" IST, 24-hour. */
export function formatIstTime(iso: string): string {
  const ist = toIst(iso);
  return `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`;
}

/** "DD Mon YYYY, HH:MM" IST, 24-hour. */
export function formatIstDateTime(iso: string): string {
  const ist = toIst(iso);
  return `${pad(ist.getUTCDate())} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

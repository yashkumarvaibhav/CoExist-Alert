export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

/** Build timestamp rendered in IST, e.g. "2026-07-02 20:45". */
export function buildTimeIst(): string {
  if (!BUILD_TIME) return "dev";
  return new Date(BUILD_TIME).toLocaleString("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

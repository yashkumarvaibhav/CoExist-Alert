import { describe, expect, it } from "vitest";

import { formatIstDateTime, formatIstTime } from "@/lib/time";

describe("IST time formatting", () => {
  it("renders a UTC instant as IST clock time (+05:30)", () => {
    expect(formatIstTime("2026-07-02T04:58:02.000Z")).toBe("10:28:02");
  });

  it("zero-pads hours, minutes and seconds", () => {
    expect(formatIstTime("2026-01-05T03:31:05.000Z")).toBe("09:01:05");
  });

  it("crosses into the next IST calendar day near UTC midnight", () => {
    expect(formatIstDateTime("2026-07-01T22:45:00.000Z")).toBe(
      "02 Jul 2026, 04:15",
    );
  });

  it("keeps the same IST day for a daytime instant", () => {
    expect(formatIstDateTime("2026-07-02T09:05:00.000Z")).toBe(
      "02 Jul 2026, 14:35",
    );
  });
});

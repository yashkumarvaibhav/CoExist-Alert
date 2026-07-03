import { describe, expect, it } from "vitest";

import { bucketMeans } from "@/lib/sparkline";

const T0 = "2026-07-02T00:00:00.000Z";

function at(minutes: number): string {
  return new Date(new Date(T0).getTime() + minutes * 60_000).toISOString();
}

describe("sparkline bucket means", () => {
  it("averages samples into fixed-width buckets across the window", () => {
    const series = bucketMeans(
      [
        { at: at(5), value: 80 },
        { at: at(10), value: 100 },
        { at: at(40), value: 60 },
      ],
      { from: T0, to: at(60), bucketMinutes: 30 },
    );
    expect(series).toEqual([90, 60]);
  });

  it("marks empty buckets as null gaps, never fake zeros", () => {
    const series = bucketMeans(
      [{ at: at(70), value: 50 }],
      { from: T0, to: at(90), bucketMinutes: 30 },
    );
    expect(series).toEqual([null, null, 50]);
  });

  it("ignores samples outside the window", () => {
    const series = bucketMeans(
      [
        { at: at(-10), value: 10 },
        { at: at(95), value: 10 },
        { at: at(15), value: 42 },
      ],
      { from: T0, to: at(90), bucketMinutes: 30 },
    );
    expect(series).toEqual([42, null, null]);
  });
});

/**
 * Fixed-width bucket means for sparklines. Empty buckets are null gaps —
 * the honesty rule applies to charts too: no data is not a zero.
 */

export interface SparklineSample {
  at: string;
  value: number;
}

export interface BucketWindow {
  from: string;
  to: string;
  bucketMinutes: number;
}

export function bucketMeans(
  samples: SparklineSample[],
  window: BucketWindow,
): Array<number | null> {
  const fromMs = new Date(window.from).getTime();
  const toMs = new Date(window.to).getTime();
  const bucketMs = window.bucketMinutes * 60_000;
  const bucketCount = Math.max(0, Math.ceil((toMs - fromMs) / bucketMs));

  const sums = new Array<number>(bucketCount).fill(0);
  const counts = new Array<number>(bucketCount).fill(0);
  for (const sample of samples) {
    const atMs = new Date(sample.at).getTime();
    if (atMs < fromMs || atMs >= toMs) continue;
    const index = Math.floor((atMs - fromMs) / bucketMs);
    sums[index] += sample.value;
    counts[index] += 1;
  }

  return sums.map((sum, index) =>
    counts[index] === 0 ? null : sum / counts[index],
  );
}

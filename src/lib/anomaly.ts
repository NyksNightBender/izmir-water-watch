/**
 * Robust z-score anomaly detection: the same baseline method used in my TÜBİTAK 2209-A
 * research on abnormal water consumption. Median and MAD make it resistant to the very
 * outliers it is trying to find, unlike mean and standard deviation.
 */
import { round } from "./parse.ts";

export const MIN_HISTORY = 14;

export interface Point {
  date: string;
  value: number;
}

export interface Anomaly {
  date: string;
  metric: string;
  value: number;
  median: number;
  z: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("median of an empty list");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** z = (x - median) / (1.4826 * MAD). 1.4826 makes MAD comparable to a standard deviation. */
export function robustZ(history: readonly number[], value: number): { median: number; z: number } | null {
  if (history.length < MIN_HISTORY) return null;
  const med = median(history);
  const mad = median(history.map((x) => Math.abs(x - med)));
  if (mad === 0) return null;
  return { median: med, z: (value - med) / (1.4826 * mad) };
}

/** Scores each day against the previous `window` days and returns the ones beyond the threshold. */
export function detectAnomalies(series: readonly Point[], metric: string, window = 28, threshold = 3.5): Anomaly[] {
  const sorted = [...series].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return sorted.flatMap((point, i) => {
    const history = sorted.slice(Math.max(0, i - window), i).map((p) => p.value);
    const score = robustZ(history, point.value);
    if (score === null || Math.abs(score.z) < threshold) return [];
    return [{ date: point.date, metric, value: point.value, median: round(score.median, 0), z: round(score.z, 2) }];
  });
}

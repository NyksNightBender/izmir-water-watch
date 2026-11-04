import { strict as assert } from "node:assert";
import { test } from "node:test";
import { detectAnomalies, median, robustZ } from "../src/lib/anomaly.ts";
import { addDays } from "../src/lib/parse.ts";

test("median", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("robustZ needs enough history", () => {
  assert.equal(robustZ([1, 2, 3], 10), null);
});

test("detectAnomalies flags a spike but not normal noise", () => {
  const base = [100, 102, 98, 101, 99, 103, 97, 100, 102, 98, 101, 99, 100, 102, 98, 101, 99, 100, 101, 99];
  const series = [...base, 160, 100].map((value, i) => ({ date: addDays("2026-10-01", i), value }));
  const flags = detectAnomalies(series, "total");
  assert.equal(flags.length, 1);
  assert.equal(flags[0]?.date, addDays("2026-10-01", base.length));
  assert.ok((flags[0]?.z ?? 0) > 3.5);
});

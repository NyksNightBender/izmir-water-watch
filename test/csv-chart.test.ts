import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readCsv, upsert, writeCsv } from "../src/lib/csv.ts";
import { compact, lineChart, niceTicks } from "../src/lib/chart.ts";

test("CSV round-trips quotes and commas", () => {
  const file = join(mkdtempSync(join(tmpdir(), "iww-")), "x.csv");
  writeCsv(file, ["a", "b"], [{ a: 'say "hi"', b: "1,5" }]);
  assert.deepEqual(readCsv(file), [{ a: 'say "hi"', b: "1,5" }]);
});

test("upsert replaces by key and sorts", () => {
  const rows = upsert([{ date: "2026-11-02", v: "1" }], [{ date: "2026-11-01", v: "0" }, { date: "2026-11-02", v: "2" }], ["date"]);
  assert.deepEqual(rows, [{ date: "2026-11-01", v: "0" }, { date: "2026-11-02", v: "2" }]);
});

test("chart helpers", () => {
  assert.deepEqual(niceTicks(0, 100), [0, 20, 40, 60, 80, 100]);
  assert.equal(compact(12_500_000), "12.5M");
  const svg = lineChart([{ name: "Tahtalı & co", points: [{ x: "2026-11-01", y: 20 }, { x: "2026-11-02", y: 21 }] }], { title: "t" });
  assert.match(svg, /^<svg/);
  assert.match(svg, /Tahtalı &amp; co/);
  assert.match(lineChart([], { title: "empty" }), /Collecting data/);
});

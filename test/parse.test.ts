import { strict as assert } from "node:assert";
import { test } from "node:test";
import { addDays, pick, toIsoDate, toMonth, toNumber } from "../src/lib/parse.ts";

test("toNumber handles Turkish and plain formats", () => {
  assert.equal(toNumber(45.2), 45.2);
  assert.equal(toNumber("45,2"), 45.2);
  assert.equal(toNumber("%45,2"), 45.2);
  assert.equal(toNumber("1.234,5"), 1234.5);
  assert.equal(toNumber("1234.5"), 1234.5);
  assert.equal(toNumber(""), null);
  assert.equal(toNumber("abc"), null);
  assert.equal(toNumber(null), null);
});

test("toIsoDate normalises the date formats İZSU uses", () => {
  assert.equal(toIsoDate("2026-11-04T00:00:00"), "2026-11-04");
  assert.equal(toIsoDate("4.11.2026"), "2026-11-04");
  assert.equal(toIsoDate("04/11/2026 08:00"), "2026-11-04");
  assert.equal(toIsoDate("/Date(1793750400000)/"), "2026-11-04");
  assert.equal(toIsoDate("yesterday"), null);
});

test("toMonth accepts numbers and Turkish month names", () => {
  assert.equal(toMonth(3), 3);
  assert.equal(toMonth("Ağustos"), 8);
  assert.equal(toMonth("ŞUBAT"), 2);
  assert.equal(toMonth(13), null);
});

test("pick is case-insensitive", () => {
  assert.equal(pick({ barajkuyuadi: "Tahtalı" }, "BarajKuyuAdi"), "Tahtalı");
});

test("addDays crosses month boundaries", () => {
  assert.equal(addDays("2026-11-01", -1), "2026-10-31");
});

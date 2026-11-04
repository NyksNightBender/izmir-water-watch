import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ckanRecords, normalizeDailyProduction, normalizeDamStatus, normalizeMonthlyProduction } from "../src/sources/izsu.ts";

test("normalizeDamStatus maps the documented fields", () => {
  const rows = normalizeDamStatus([
    { BarajKuyuAdi: "Tahtalı", DurumTarihi: "2026-11-04T00:00:00", DolulukOrani: 21.37, SuDurumu: 65_000_000, TuketilebilirSuKapasitesi: 60_000_000, MaksimumSuKapasitesi: 306_000_000, SuYuksekligi: 41.2 },
    { BarajKuyuAdi: "Balçova", DurumTarihi: "2026-11-04T00:00:00", DolulukOrani: "3,5" },
    { BarajKuyuAdi: "", DurumTarihi: "2026-11-04" },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    date: "2026-11-04",
    dam: "Tahtalı",
    fillPct: 21.37,
    volumeM3: 65_000_000,
    usableCapacityM3: 60_000_000,
    maxCapacityM3: 306_000_000,
    levelM: 41.2,
  });
  assert.equal(rows[1]?.fillPct, 3.5);
});

test("normalizeDamStatus converts fractions to percentages", () => {
  const rows = normalizeDamStatus([
    { BarajKuyuAdi: "A", DurumTarihi: "2026-11-04", DolulukOrani: 0.2137 },
    { BarajKuyuAdi: "B", DurumTarihi: "2026-11-04", DolulukOrani: 0.05 },
  ]);
  assert.deepEqual(rows.map((r) => r.fillPct), [21.37, 5]);
});

test("normalizeDailyProduction flattens the per-source list", () => {
  const rows = normalizeDailyProduction({
    UretimTarihi: "2026-11-03T00:00:00",
    BarajKuyuUretimleri: [
      { TurAdi: "BARAJ", BarajKuyuAdi: "Tahtalı", UretimMiktari: 250_000 },
      { TurAdi: "KUYU", BarajKuyuAdi: "Sarıkız", UretimMiktari: "120.000,5" },
      { TurAdi: "KUYU", BarajKuyuAdi: "Bozuk", UretimMiktari: null },
    ],
  });
  assert.deepEqual(rows, [
    { date: "2026-11-03", sourceType: "BARAJ", source: "Tahtalı", m3: 250_000 },
    { date: "2026-11-03", sourceType: "KUYU", source: "Sarıkız", m3: 120_000.5 },
  ]);
});

test("normalizeDailyProduction rejects an unexpected shape", () => {
  assert.throws(() => normalizeDailyProduction({ foo: 1 }), /missing/);
});

test("normalizeMonthlyProduction accepts month names", () => {
  assert.deepEqual(normalizeMonthlyProduction([{ Yil: 2025, Ay: "Mart", UretimKaynagi: "Tahtalı", UretimMiktari: 9_000_000 }]), [
    { year: 2025, month: 3, source: "Tahtalı", m3: 9_000_000 },
  ]);
});

test("normalizeDamStatus reads the open data portal's CKAN format", () => {
  const raw = {
    success: true,
    result: {
      records: [
        { _id: 1, BARAJ_KUYU_ADI: "Tahtalı Barajı", DURUM_TARIHI: "2026-10-14T00:00:00", SU_DURUMU: 142323000, DOLULUK_ORANI: 42.75, SU_YUKSEKLIGI: 42.75, TUKETILEBILIR_SU_KAPASITESI: 122723000, MAKSIMUM_SU_KAPASITESI: 306650000 },
      ],
    },
  };
  const [row] = normalizeDamStatus(ckanRecords(raw));
  assert.equal(row?.dam, "Tahtalı");
  assert.equal(row?.date, "2026-10-14");
  assert.equal(row?.fillPct, 42.75);
  assert.equal(row?.volumeM3, 142323000);
});

/**
 * Daily run: fetch → normalise → upsert CSVs → detect unusual days → redraw charts → refresh README.
 * Each source is independent, so one API being down does not block the others.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readCsv, upsert, writeCsv, type Row } from "./lib/csv.ts";
import { detectAnomalies } from "./lib/anomaly.ts";
import { lineChart, type Series } from "./lib/chart.ts";
import { addDays, cellOf, istanbulDate } from "./lib/parse.ts";
import { renderLatest, replaceSection } from "./readme.ts";
import { fetchDailyProduction, fetchDamStatus, fetchMonthlyProduction } from "./sources/izsu.ts";
import { fetchRecentWeather, fetchWeatherHistory, type WeatherDay } from "./sources/weather.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const path = (...p: string[]): string => join(ROOT, ...p);

const FILES = {
  dams: { file: path("data", "dams.csv"), columns: ["date", "dam", "fill_pct", "volume_m3", "usable_capacity_m3", "max_capacity_m3", "level_m"], keys: ["date", "dam"] },
  production: { file: path("data", "production_daily.csv"), columns: ["date", "source_type", "source", "m3"], keys: ["date", "source"] },
  monthly: { file: path("data", "production_monthly.csv"), columns: ["year", "month", "source", "m3"], keys: ["year", "month", "source"] },
  weather: { file: path("data", "weather.csv"), columns: ["date", "t_max_c", "t_min_c", "precip_mm", "et0_mm"], keys: ["date"] },
  anomalies: { file: path("data", "anomalies.csv"), columns: ["date", "metric", "value", "median", "z"], keys: ["date", "metric"] },
} as const;

type Table = (typeof FILES)[keyof typeof FILES];

function save(table: Table, incoming: Row[]): void {
  writeCsv(table.file, table.columns, upsert(readCsv(table.file), incoming, table.keys));
}

const weatherRow = (w: WeatherDay): Row => ({
  date: w.date,
  t_max_c: cellOf(w.tMaxC),
  t_min_c: cellOf(w.tMinC),
  precip_mm: cellOf(w.precipMm),
  et0_mm: cellOf(w.et0Mm),
});

const today = istanbulDate();
const report: { source: string; ok: boolean; detail: string }[] = [];

async function step(source: string, run: () => Promise<number>): Promise<void> {
  try {
    report.push({ source, ok: true, detail: `${await run()} rows` });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    report.push({ source, ok: false, detail });
    // Shows up as a warning annotation on the Actions run page.
    if (process.env["GITHUB_ACTIONS"]) console.log(`::warning title=${source} failed::${detail.replace(/\r?\n/g, " ")}`);
  }
}

let damsVia = "";
await step("İZSU dam status", async () => {
  const { rows, via } = await fetchDamStatus();
  damsVia = via;
  save(
    FILES.dams,
    rows.map((r) => ({
      date: r.date,
      dam: r.dam,
      fill_pct: cellOf(r.fillPct),
      volume_m3: cellOf(r.volumeM3),
      usable_capacity_m3: cellOf(r.usableCapacityM3),
      max_capacity_m3: cellOf(r.maxCapacityM3),
      level_m: cellOf(r.levelM),
    })),
  );
  return rows.length;
});
if (damsVia !== "") report.at(-1)!.detail += ` via ${damsVia}`;

await step("İZSU daily production", async () => {
  const rows = await fetchDailyProduction();
  save(FILES.production, rows.map((r) => ({ date: r.date, source_type: r.sourceType, source: r.source, m3: String(r.m3) })));
  return rows.length;
});

await step("İZSU monthly production", async () => {
  const rows = await fetchMonthlyProduction();
  save(
    FILES.monthly,
    rows.map((r) => ({ year: String(r.year), month: String(r.month).padStart(2, "0"), source: r.source, m3: String(r.m3) })),
  );
  return rows.length;
});

await step("Open-Meteo weather", async () => {
  const backfill = readCsv(FILES.weather.file).length === 0 ? await fetchWeatherHistory("2024-01-01", addDays(today, -1)) : [];
  const recent = await fetchRecentWeather(today);
  save(FILES.weather, [...backfill, ...recent].map(weatherRow));
  return backfill.length + recent.length;
});

// Derived outputs are rebuilt from the full history on every run, so they are always consistent.
const dams = readCsv(FILES.dams.file);
const production = readCsv(FILES.production.file);
const monthly = readCsv(FILES.monthly.file);
const weather = readCsv(FILES.weather.file);

const dailyTotals = new Map<string, number>();
for (const r of production) {
  const date = r["date"] ?? "";
  dailyTotals.set(date, (dailyTotals.get(date) ?? 0) + Number(r["m3"] ?? 0));
}
const anomalies = detectAnomalies(
  [...dailyTotals].map(([date, value]) => ({ date, value: Math.round(value) })),
  "total_production_m3",
);
writeCsv(
  FILES.anomalies.file,
  FILES.anomalies.columns,
  anomalies.map((a) => ({ date: a.date, metric: a.metric, value: String(a.value), median: String(a.median), z: String(a.z) })),
);

mkdirSync(path("charts"), { recursive: true });

const damNames = [...new Set(dams.map((r) => r["dam"] ?? ""))].filter((n) => n !== "").sort();
const damSeries: Series[] = damNames.map((name) => ({
  name,
  points: dams
    .filter((r) => r["dam"] === name && r["fill_pct"] !== "")
    .map((r) => ({ x: r["date"] ?? "", y: Number(r["fill_pct"]) })),
}));
writeFileSync(
  path("charts", "dams.svg"),
  lineChart(damSeries, { title: "İzmir dam fill levels", subtitle: "Share of capacity, updated daily from İZSU", yMin: 0, yMax: 100, ySuffix: "%" }),
);

const monthlyTotals = new Map<string, number>();
for (const r of monthly) {
  const key = `${r["year"]}-${r["month"]}`;
  monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + Number(r["m3"] ?? 0));
}
writeFileSync(
  path("charts", "production.svg"),
  lineChart([{ name: "All sources", points: [...monthlyTotals].map(([x, y]) => ({ x, y })) }], {
    title: "Monthly water production in İzmir",
    subtitle: "m³ per month, all dams and wells (İZSU)",
    yMin: 0,
  }),
);

const monthlyWater = new Map<string, { rain: number; et0: number }>();
for (const r of weather) {
  const key = (r["date"] ?? "").slice(0, 7);
  if (key >= today.slice(0, 7)) continue; // skip the month in progress
  const m = monthlyWater.get(key) ?? { rain: 0, et0: 0 };
  m.rain += Number(r["precip_mm"] || 0);
  m.et0 += Number(r["et0_mm"] || 0);
  monthlyWater.set(key, m);
}
const waterBalance = [...monthlyWater].sort(([a], [b]) => (a < b ? -1 : 1));
writeFileSync(
  path("charts", "weather.svg"),
  lineChart(
    [
      { name: "Rain (mm)", points: waterBalance.map(([x, m]) => ({ x, y: Math.round(m.rain) })) },
      { name: "Evapotranspiration (mm)", points: waterBalance.map(([x, m]) => ({ x, y: Math.round(m.et0) })) },
    ],
    { title: "Rain vs evaporation in İzmir", subtitle: "Monthly totals from Open-Meteo. When evaporation beats rain, the dams fall.", yMin: 0 },
  ),
);

const readmePath = path("README.md");
writeFileSync(readmePath, replaceSection(readFileSync(readmePath, "utf8"), renderLatest({ dams, production, weather, anomalies: readCsv(FILES.anomalies.file) })));

console.table(report);
if (report.every((r) => !r.ok)) {
  console.error("Every source failed.");
  process.exit(1);
}

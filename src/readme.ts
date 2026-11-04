import type { Row } from "./lib/csv.ts";
import { addDays, round } from "./lib/parse.ts";

export const START = "<!-- LATEST:START -->";
export const END = "<!-- LATEST:END -->";

const num = (v: string | undefined): number | null => (v === undefined || v === "" ? null : Number(v));
const fmt = (n: number | null, digits = 1, suffix = ""): string => (n === null ? "–" : `${n.toFixed(digits)}${suffix}`);
const latestDate = (rows: readonly Row[]): string | undefined => rows.map((r) => r["date"] ?? "").sort().at(-1);

function damTable(dams: readonly Row[]): string[] {
  const date = latestDate(dams);
  if (date === undefined) return ["_No dam readings yet._"];
  const weekAgo = addDays(date, -7);
  const lines = [
    `**Dam levels on ${date}**`,
    "",
    "| Dam | Fill | 7-day change | Water volume |",
    "| --- | ---: | ---: | ---: |",
  ];
  const today = dams.filter((r) => r["date"] === date).sort((a, b) => (num(b["fill_pct"]) ?? 0) - (num(a["fill_pct"]) ?? 0));
  for (const row of today) {
    const fill = num(row["fill_pct"]);
    const before = num(dams.find((r) => r["date"] === weekAgo && r["dam"] === row["dam"])?.["fill_pct"]);
    const change = fill !== null && before !== null ? round(fill - before, 2) : null;
    const volume = num(row["volume_m3"]);
    lines.push(
      `| ${row["dam"]} | ${fmt(fill, 1, "%")} | ${change === null ? "–" : `${change >= 0 ? "+" : ""}${change.toFixed(2)} pts`} | ${volume === null ? "–" : `${(volume / 1e6).toFixed(2)} million m³`} |`,
    );
  }
  return lines;
}

function productionLine(production: readonly Row[]): string[] {
  const date = latestDate(production);
  if (date === undefined) return [];
  const rows = production.filter((r) => r["date"] === date);
  const total = rows.reduce((sum, r) => sum + (num(r["m3"]) ?? 0), 0);
  const top = [...rows].sort((a, b) => (num(b["m3"]) ?? 0) - (num(a["m3"]) ?? 0)).slice(0, 3);
  return [
    "",
    `**Water production on ${date}:** ${Math.round(total).toLocaleString("en-US")} m³ from ${rows.length} sources. Largest: ${top.map((r) => r["source"]).join(", ")}.`,
  ];
}

function weatherLine(weather: readonly Row[]): string[] {
  const date = latestDate(weather);
  const row = weather.find((r) => r["date"] === date);
  if (date === undefined || row === undefined) return [];
  return [
    "",
    `**Weather on ${date}:** ${fmt(num(row["t_min_c"]), 1)}–${fmt(num(row["t_max_c"]), 1)} °C, rain ${fmt(num(row["precip_mm"]), 1, " mm")}, evapotranspiration ${fmt(num(row["et0_mm"]), 1, " mm")}.`,
  ];
}

function anomalyLines(anomalies: readonly Row[], productionDays: number): string[] {
  const recent = [...anomalies].sort((a, b) => ((a["date"] ?? "") < (b["date"] ?? "") ? 1 : -1)).slice(0, 5);
  if (recent.length === 0) {
    return [
      "",
      productionDays < 15
        ? `**Unusual days:** collecting history (${productionDays} of 15 days needed before flagging starts).`
        : "**Unusual days:** none flagged.",
    ];
  }
  return [
    "",
    "**Recent unusual days** (robust z-score of total production, |z| ≥ 3.5):",
    "",
    "| Date | Total production | 28-day median | z |",
    "| --- | ---: | ---: | ---: |",
    ...recent.map(
      (r) =>
        `| ${r["date"]} | ${Number(r["value"]).toLocaleString("en-US")} m³ | ${Number(r["median"]).toLocaleString("en-US")} m³ | ${r["z"]} |`,
    ),
  ];
}

export function renderLatest(input: { dams: Row[]; production: Row[]; weather: Row[]; anomalies: Row[] }): string {
  const productionDays = new Set(input.production.map((r) => r["date"])).size;
  return [
    ...damTable(input.dams),
    ...productionLine(input.production),
    ...weatherLine(input.weather),
    ...anomalyLines(input.anomalies, productionDays),
  ].join("\n");
}

export function replaceSection(readme: string, content: string): string {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) throw new Error("README is missing the LATEST markers");
  return `${readme.slice(0, start + START.length)}\n${content}\n${readme.slice(end)}`;
}

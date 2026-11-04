/**
 * İZSU (İzmir Water and Sewerage Administration) open web services.
 * Docs: https://openfiles.izmir.bel.tr/309436/docs/izsu-WebServisKullanimDokumani_1.0.pdf
 */
import { fetchJson } from "../lib/http.ts";
import { isRecord, pick, round, text, toIsoDate, toMonth, toNumber } from "../lib/parse.ts";

const BASE = "https://openapi.izmir.bel.tr/api/izsu";
/** Fallback: the same dam table on İzmir's CKAN open data portal (refreshed less often). */
const CKAN_DAMS = "https://acikveri.bizizmir.com/api/3/action/datastore_search?resource_id=5c2ad5b0-f681-45a6-b72c-170791ea8f50&limit=100";

/** "Tahtalı Barajı" and "Tahtalı" are the same dam. */
export const damName = (raw: string): string => raw.replace(/\s+baraj[ıi]$/iu, "").trim();

export interface DamReading {
  date: string;
  dam: string;
  fillPct: number | null;
  volumeM3: number | null;
  usableCapacityM3: number | null;
  maxCapacityM3: number | null;
  levelM: number | null;
}

export interface ProductionReading {
  date: string;
  sourceType: string;
  source: string;
  m3: number;
}

export interface MonthlyProduction {
  year: number;
  month: number;
  source: string;
  m3: number;
}

export function normalizeDamStatus(raw: unknown): DamReading[] {
  if (!Array.isArray(raw)) throw new Error("barajdurum: expected a JSON array");
  const records = raw.filter(isRecord);
  const fills = records.map((r) => toNumber(pick(r, "DolulukOrani"))).filter((n): n is number => n !== null);
  // Some endpoints report 0.45 instead of 45 (%). If every dam is <= 1, treat the values as fractions.
  const isFraction = fills.length > 0 && Math.max(...fills) <= 1;
  return records.flatMap((r) => {
    const date = toIsoDate(pick(r, "DurumTarihi"));
    const dam = damName(text(pick(r, "BarajKuyuAdi")));
    if (date === null || dam === "") return [];
    const fill = toNumber(pick(r, "DolulukOrani"));
    return [
      {
        date,
        dam,
        fillPct: fill === null ? null : round(isFraction ? fill * 100 : fill, 2),
        volumeM3: toNumber(pick(r, "SuDurumu")),
        usableCapacityM3: toNumber(pick(r, "TuketilebilirSuKapasitesi")),
        maxCapacityM3: toNumber(pick(r, "MaksimumSuKapasitesi")),
        levelM: toNumber(pick(r, "SuYuksekligi")),
      },
    ];
  });
}

export function normalizeDailyProduction(raw: unknown): ProductionReading[] {
  const record = Array.isArray(raw) ? raw[0] : raw;
  if (!isRecord(record)) throw new Error("gunluksuuretimi: expected a JSON object");
  const date = toIsoDate(pick(record, "UretimTarihi"));
  const items = pick(record, "BarajKuyuUretimleri");
  if (date === null || !Array.isArray(items)) throw new Error("gunluksuuretimi: missing UretimTarihi or BarajKuyuUretimleri");
  return items.filter(isRecord).flatMap((item) => {
    const source = text(pick(item, "BarajKuyuAdi"));
    const m3 = toNumber(pick(item, "UretimMiktari"));
    if (source === "" || m3 === null) return [];
    return [{ date, sourceType: text(pick(item, "TurAdi")), source, m3 }];
  });
}

export function normalizeMonthlyProduction(raw: unknown): MonthlyProduction[] {
  if (!Array.isArray(raw)) throw new Error("suuretiminindagilimi: expected a JSON array");
  return raw.filter(isRecord).flatMap((r) => {
    const year = toNumber(pick(r, "Yil"));
    const month = toMonth(pick(r, "Ay"));
    const source = text(pick(r, "UretimKaynagi"));
    const m3 = toNumber(pick(r, "UretimMiktari"));
    if (year === null || month === null || source === "" || m3 === null) return [];
    return [{ year, month, source, m3 }];
  });
}

export function ckanRecords(raw: unknown): unknown {
  const result = isRecord(raw) ? raw["result"] : undefined;
  if (!isRecord(result) || !Array.isArray(result["records"])) throw new Error("CKAN: missing result.records");
  return result["records"];
}

/** Live web service first; if it is down, the open data portal's latest snapshot. */
export async function fetchDamStatus(): Promise<{ rows: DamReading[]; via: string }> {
  try {
    return { rows: normalizeDamStatus(await fetchJson(`${BASE}/barajdurum`)), via: "İZSU web service" };
  } catch (primary) {
    try {
      return { rows: normalizeDamStatus(ckanRecords(await fetchJson(CKAN_DAMS))), via: "open data portal snapshot" };
    } catch (fallback) {
      throw new Error(`${primary instanceof Error ? primary.message : String(primary)}; fallback: ${fallback instanceof Error ? fallback.message : String(fallback)}`);
    }
  }
}

export const fetchDailyProduction = async (): Promise<ProductionReading[]> =>
  normalizeDailyProduction(await fetchJson(`${BASE}/gunluksuuretimi`));

export const fetchMonthlyProduction = async (): Promise<MonthlyProduction[]> =>
  normalizeMonthlyProduction(await fetchJson(`${BASE}/suuretiminindagilimi/`));

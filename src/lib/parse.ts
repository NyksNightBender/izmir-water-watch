/** Small, dependency-free helpers for cleaning values from the İZSU and Open-Meteo APIs. */

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const fieldKey = (k: string): string => k.replace(/_/g, "").toLowerCase();

/**
 * Reads a field regardless of casing or underscores, because the same İZSU data is published
 * as "BarajKuyuAdi" by the web service and as "BARAJ_KUYU_ADI" by the open data portal.
 */
export function pick(record: JsonRecord, key: string): unknown {
  if (key in record) return record[key];
  const wanted = fieldKey(key);
  const match = Object.keys(record).find((k) => fieldKey(k) === wanted);
  return match === undefined ? undefined : record[match];
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

/** Parses numbers like 45.2, "45,2", "%45,2" and "1.234,5" (Turkish format). */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let s = value.trim().replace(/[%\s]/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Normalises "2026-11-04T00:00:00", "04.11.2026" and "/Date(1730678400000)/" to "2026-11-04". */
export function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  m = /\/Date\((\d+)/.exec(s);
  if (m) return istanbulDate(new Date(Number(m[1])));
  return null;
}

/** Calendar date in İzmir (Europe/Istanbul), as YYYY-MM-DD. */
export function istanbulDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function cellOf(n: number | null): string {
  return n === null ? "" : String(n);
}

const TR_MONTHS = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];

/** Accepts 1-12 or a Turkish month name ("Ocak", "ŞUBAT"). */
export function toMonth(value: unknown): number | null {
  const n = toNumber(value);
  if (n !== null) return n >= 1 && n <= 12 ? n : null;
  const idx = TR_MONTHS.indexOf(text(value).toLocaleLowerCase("tr"));
  return idx === -1 ? null : idx + 1;
}

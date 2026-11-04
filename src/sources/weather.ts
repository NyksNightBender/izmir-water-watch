/** Daily weather for central İzmir from Open-Meteo (free, no API key, CC BY 4.0). */
import { fetchJson } from "../lib/http.ts";
import { isRecord, toNumber } from "../lib/parse.ts";

const LAT = 38.42;
const LON = 27.14;
const DAILY = ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "et0_fao_evapotranspiration"] as const;
const QUERY = `latitude=${LAT}&longitude=${LON}&daily=${DAILY.join(",")}&timezone=Europe%2FIstanbul`;

export interface WeatherDay {
  date: string;
  tMaxC: number | null;
  tMinC: number | null;
  precipMm: number | null;
  et0Mm: number | null;
}

export function normalizeWeather(raw: unknown): WeatherDay[] {
  const daily = isRecord(raw) ? raw["daily"] : undefined;
  if (!isRecord(daily) || !Array.isArray(daily["time"])) throw new Error("open-meteo: missing daily.time");
  const column = (key: string): unknown[] => {
    const values = daily[key];
    return Array.isArray(values) ? values : [];
  };
  return daily["time"].map((t, i) => ({
    date: String(t),
    tMaxC: toNumber(column("temperature_2m_max")[i]),
    tMinC: toNumber(column("temperature_2m_min")[i]),
    precipMm: toNumber(column("precipitation_sum")[i]),
    et0Mm: toNumber(column("et0_fao_evapotranspiration")[i]),
  }));
}

/** The last 7 complete days (today is still in progress, so it is skipped). */
export async function fetchRecentWeather(today: string): Promise<WeatherDay[]> {
  const raw = await fetchJson(`https://api.open-meteo.com/v1/forecast?${QUERY}&past_days=7&forecast_days=1`);
  return normalizeWeather(raw).filter((d) => d.date < today && d.tMaxC !== null);
}

/** Historical backfill, used once when the repository has no weather data yet. */
export async function fetchWeatherHistory(start: string, end: string): Promise<WeatherDay[]> {
  const raw = await fetchJson(`https://archive-api.open-meteo.com/v1/archive?${QUERY}&start_date=${start}&end_date=${end}`);
  return normalizeWeather(raw).filter((d) => d.tMaxC !== null);
}

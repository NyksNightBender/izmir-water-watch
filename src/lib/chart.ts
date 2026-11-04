/** Minimal SVG line charts with no dependencies. Neutral colours read on GitHub's light and dark themes. */

export interface ChartPoint {
  x: string; // YYYY-MM-DD or YYYY-MM
  y: number;
}

export interface Series {
  name: string;
  points: readonly ChartPoint[];
}

export interface ChartOptions {
  title: string;
  subtitle?: string;
  yMin?: number;
  yMax?: number;
  ySuffix?: string;
  width?: number;
  height?: number;
}

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
const INK = "#8b949e";
const DAY = 86_400_000;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const toTime = (x: string): number => Date.parse(x.length === 7 ? `${x}-01T00:00:00Z` : `${x}T00:00:00Z`);

export function niceTicks(lo: number, hi: number, count = 5): number[] {
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}

export function compact(n: number): string {
  const abs = Math.abs(n);
  const trim = (v: number): string => String(Number(v.toFixed(1)));
  if (abs >= 1e9) return `${trim(n / 1e9)}B`;
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e3) return `${trim(n / 1e3)}k`;
  return trim(n);
}

function dateLabel(t: number, spanDays: number): string {
  const d = new Date(t);
  const opts: Intl.DateTimeFormatOptions =
    spanDays > 3 * 365 ? { year: "numeric" } : spanDays > 90 ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" };
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(d);
}

function frame(width: number, height: number, inner: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">`,
    inner,
    "</svg>",
    "",
  ].join("\n");
}

export function lineChart(series: readonly Series[], options: ChartOptions): string {
  const width = options.width ?? 820;
  const height = options.height ?? 380;
  const title = `<text x="16" y="28" font-size="17" font-weight="600" fill="${INK}">${esc(options.title)}</text>`;
  const subtitle = options.subtitle
    ? `<text x="16" y="48" font-size="12" fill="${INK}">${esc(options.subtitle)}</text>`
    : "";
  const visible = series.filter((s) => s.points.length > 0);
  const all = visible.flatMap((s) => s.points);
  if (all.length === 0) {
    const empty = `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="14" fill="${INK}">Collecting data. The first points appear after the next daily run.</text>`;
    return frame(width, height, [title, subtitle, empty].join("\n"));
  }

  const legendRows = Math.ceil(visible.length / 4);
  const m = { top: 64 + legendRows * 20, right: 28, bottom: 36, left: 56 };
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;

  const times = all.map((p) => toTime(p.x));
  let x0 = Math.min(...times);
  let x1 = Math.max(...times);
  if (x0 === x1) {
    x0 -= 3 * DAY;
    x1 += 3 * DAY;
  }
  const values = all.map((p) => p.y);
  let y0 = options.yMin ?? Math.min(...values);
  let y1 = options.yMax ?? Math.max(...values);
  if (y0 === y1) {
    y0 -= 1;
    y1 += 1;
  }
  const yTicks = niceTicks(y0, y1).filter((t) => (options.yMin === undefined || t >= options.yMin) && (options.yMax === undefined || t <= options.yMax));
  y0 = Math.min(y0, yTicks[0] ?? y0);
  y1 = Math.max(y1, yTicks.at(-1) ?? y1);

  const sx = (t: number): number => m.left + ((t - x0) / (x1 - x0)) * plotW;
  const sy = (v: number): number => m.top + plotH - ((v - y0) / (y1 - y0)) * plotH;
  const f = (n: number): string => n.toFixed(1);

  const parts: string[] = [title, subtitle];

  visible.forEach((s, i) => {
    const lx = 16 + (i % 4) * 200;
    const ly = 66 + Math.floor(i / 4) * 20;
    const color = PALETTE[i % PALETTE.length]!;
    parts.push(
      `<rect x="${lx}" y="${ly - 9}" width="12" height="12" rx="2" fill="${color}"/>`,
      `<text x="${lx + 18}" y="${ly + 1}" font-size="12" fill="${INK}">${esc(s.name)}</text>`,
    );
  });

  for (const t of yTicks) {
    const y = f(sy(t));
    parts.push(
      `<line x1="${m.left}" x2="${width - m.right}" y1="${y}" y2="${y}" stroke="${INK}" stroke-opacity="0.25"/>`,
      `<text x="${m.left - 8}" y="${y}" dy="4" text-anchor="end" font-size="11" fill="${INK}">${esc(compact(t) + (options.ySuffix ?? ""))}</text>`,
    );
  }

  const spanDays = (x1 - x0) / DAY;
  const xTickCount = Math.min(6, Math.max(2, Math.round(spanDays)));
  for (let i = 0; i <= xTickCount; i++) {
    const t = x0 + ((x1 - x0) * i) / xTickCount;
    parts.push(
      `<text x="${f(sx(t))}" y="${height - m.bottom + 18}" text-anchor="middle" font-size="11" fill="${INK}">${esc(dateLabel(t, spanDays))}</text>`,
    );
  }

  visible.forEach((s, i) => {
    const color = PALETTE[i % PALETTE.length]!;
    const pts = [...s.points].sort((a, b) => toTime(a.x) - toTime(b.x));
    if (pts.length > 1) {
      const d = pts.map((p, j) => `${j === 0 ? "M" : "L"}${f(sx(toTime(p.x)))},${f(sy(p.y))}`).join("");
      parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
    const last = pts.at(-1)!;
    parts.push(`<circle cx="${f(sx(toTime(last.x)))}" cy="${f(sy(last.y))}" r="3.5" fill="${color}"/>`);
  });

  return frame(width, height, parts.filter((p) => p !== "").join("\n"));
}

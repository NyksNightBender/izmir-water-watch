import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type Row = Record<string, string>;

function parseLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (quoted) {
      if (c !== '"') current += c;
      else if (line.charAt(i + 1) === '"') {
        current += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      cells.push(current);
      current = "";
    } else current += c;
  }
  cells.push(current);
  return cells;
}

const escapeCell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function readCsv(path: string): Row[] {
  if (!existsSync(path)) return [];
  const [header, ...lines] = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.length > 0);
  if (header === undefined) return [];
  const columns = parseLine(header);
  return lines.map((line) => {
    const cells = parseLine(line);
    return Object.fromEntries(columns.map((col, i) => [col, cells[i] ?? ""]));
  });
}

export function writeCsv(path: string, columns: readonly string[], rows: readonly Row[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const body = rows.map((row) => columns.map((col) => escapeCell(row[col] ?? "")).join(","));
  writeFileSync(path, `${[columns.join(","), ...body].join("\n")}\n`);
}

/** Merges rows by key (incoming wins) and returns them sorted by key, so diffs stay small and stable. */
export function upsert(existing: readonly Row[], incoming: readonly Row[], keys: readonly string[]): Row[] {
  const keyOf = (row: Row): string => keys.map((k) => row[k] ?? "").join("\u0000");
  const merged = new Map<string, Row>();
  for (const row of [...existing, ...incoming]) merged.set(keyOf(row), row);
  return [...merged.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row);
}

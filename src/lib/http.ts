const USER_AGENT = "izmir-water-watch/1.0 (+https://github.com/NyksNightBender/izmir-water-watch)";

/** GET a JSON document with a timeout and a few retries. */
export async function fetchJson(url: string, attempts = 3): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
    }
  }
  throw new Error(`${url}: ${describe(lastError)}`);
}

/** Node's fetch hides the useful part ("certificate has expired", "ECONNRESET") in error.cause. */
export function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause: unknown = error.cause;
  if (cause instanceof Error) {
    const code = (cause as Error & { code?: string }).code;
    return `${error.message} (${code ? `${code}: ` : ""}${cause.message})`;
  }
  return error.message;
}

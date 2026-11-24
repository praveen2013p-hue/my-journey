/**
 * Kite's historical-candles endpoint needs a numeric `instrument_token`,
 * not a trading symbol (BRIEF.md §7.2's "Kite instruments-dump lookup").
 * This fetches and caches NSE's instrument dump (a large CSV) once per
 * process, then looks up a ticker's token by its tradingsymbol.
 */

const INSTRUMENTS_URL = "https://api.kite.trade/instruments/NSE";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // instrument tokens rarely change intraday

interface CachedInstruments {
  tokenBySymbol: Map<string, number>;
  fetchedAt: number;
}

let cache: CachedInstruments | null = null;

/**
 * Minimal positional CSV parse: Kite's columns are
 * `instrument_token,exchange_token,tradingsymbol,name,...` - both fields
 * we need come before `name`, the one column that can itself contain a
 * comma, so a plain split(",") is safe for these two positions
 * regardless of what `name` or later columns contain.
 */
export function parseTokensBySymbol(csv: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = csv.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const commaIdx1 = line.indexOf(",");
    if (commaIdx1 < 0) continue;
    const commaIdx2 = line.indexOf(",", commaIdx1 + 1);
    if (commaIdx2 < 0) continue;
    const commaIdx3 = line.indexOf(",", commaIdx2 + 1);
    if (commaIdx3 < 0) continue;

    const token = Number(line.slice(0, commaIdx1));
    const tradingsymbol = line.slice(commaIdx2 + 1, commaIdx3);
    if (Number.isFinite(token) && tradingsymbol) {
      map.set(tradingsymbol, token);
    }
  }
  return map;
}

async function fetchInstruments(accessToken: string): Promise<Map<string, number>> {
  const apiKey = process.env.KITE_API_KEY;
  const response = await fetch(INSTRUMENTS_URL, {
    headers: { Authorization: `token ${apiKey}:${accessToken}` },
  });
  if (!response.ok) throw new Error(`Kite instruments dump failed (HTTP ${response.status}).`);
  return parseTokensBySymbol(await response.text());
}

/** Null if the dump can't be fetched or the symbol isn't in it - never throws (BRIEF.md §17.5). */
export async function getInstrumentToken(accessToken: string, tradingsymbol: string): Promise<number | null> {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    try {
      cache = { tokenBySymbol: await fetchInstruments(accessToken), fetchedAt: now };
    } catch (err) {
      console.error("[zerodha instruments] fetch failed", err);
      return null;
    }
  }
  return cache.tokenBySymbol.get(tradingsymbol) ?? null;
}

/** Test-only. */
export function __resetInstrumentsCacheForTests(): void {
  cache = null;
}

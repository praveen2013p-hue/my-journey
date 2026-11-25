/**
 * Kite's historical-candles endpoint needs a numeric `instrument_token`,
 * not a trading symbol (BRIEF.md §7.2's "Kite instruments-dump lookup").
 * This fetches and caches NSE's instrument dump (a large CSV) once per
 * process, then looks up a ticker's token by its tradingsymbol.
 */

const INSTRUMENTS_URL = "https://api.kite.trade/instruments/NSE";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // instrument tokens rarely change intraday

export interface IndexInstrument {
  tradingsymbol: string;
  name: string;
}

interface CachedInstruments {
  tokenBySymbol: Map<string, number>;
  /** Just the INDICES segment (a few hundred rows, not the whole equity
   * dump) - this is the "is BANKNIFTY actually Kite's name for it"
   * lookup Settings' symbol search uses (DECISIONS.md). */
  indexInstruments: IndexInstrument[];
  fetchedAt: number;
}

let cache: CachedInstruments | null = null;
let inFlight: Promise<Pick<CachedInstruments, "tokenBySymbol" | "indexInstruments">> | null = null;

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

/**
 * `name` (the one column that can contain a comma - see the test above)
 * sits between `tradingsymbol` and the rest, so segment/exchange - the
 * last two columns - are read from the END of the line instead, which is
 * unaffected by however many commas `name` has.
 */
export function parseIndexInstruments(csv: string): IndexInstrument[] {
  const rows: IndexInstrument[] = [];
  const lines = csv.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const lastComma = line.lastIndexOf(",");
    const secondLastComma = line.lastIndexOf(",", lastComma - 1);
    if (lastComma < 0 || secondLastComma < 0) continue;
    const segment = line.slice(secondLastComma + 1, lastComma);
    if (segment !== "INDICES") continue;

    const commaIdx1 = line.indexOf(",");
    const commaIdx2 = line.indexOf(",", commaIdx1 + 1);
    const commaIdx3 = line.indexOf(",", commaIdx2 + 1);
    if (commaIdx2 < 0 || commaIdx3 < 0) continue;
    const tradingsymbol = line.slice(commaIdx2 + 1, commaIdx3);

    // `name` may itself be quoted-with-a-comma (see the test above for
    // parseTokensBySymbol) - handle both that and the plain case.
    const afterName = line.slice(commaIdx3 + 1);
    let name: string;
    if (afterName.startsWith('"')) {
      const closingQuote = afterName.indexOf('"', 1);
      name = closingQuote >= 0 ? afterName.slice(1, closingQuote) : afterName;
    } else {
      const nextComma = afterName.indexOf(",");
      name = nextComma >= 0 ? afterName.slice(0, nextComma) : afterName;
    }

    if (tradingsymbol) rows.push({ tradingsymbol, name });
  }
  return rows;
}

async function fetchInstruments(
  accessToken: string,
): Promise<Pick<CachedInstruments, "tokenBySymbol" | "indexInstruments">> {
  const apiKey = process.env.KITE_API_KEY;
  const response = await fetch(INSTRUMENTS_URL, {
    headers: { Authorization: `token ${apiKey}:${accessToken}` },
  });
  if (!response.ok) throw new Error(`Kite instruments dump failed (HTTP ${response.status}).`);
  const csv = await response.text();
  return { tokenBySymbol: parseTokensBySymbol(csv), indexInstruments: parseIndexInstruments(csv) };
}

/**
 * Shares one in-flight fetch of the dump across concurrent callers (the
 * Performance page resolves a whole shortlist in parallel) instead of
 * each starting their own - it's several MB, not something to download
 * N times concurrently. Returns null (never throws, BRIEF.md §17.5) if
 * the dump can't be fetched.
 */
async function ensureCache(accessToken: string): Promise<CachedInstruments | null> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt <= CACHE_TTL_MS) return cache;

  if (!inFlight) {
    inFlight = fetchInstruments(accessToken).finally(() => {
      inFlight = null;
    });
  }
  try {
    const fetched = await inFlight;
    cache = { ...fetched, fetchedAt: now };
    return cache;
  } catch (err) {
    console.error("[zerodha instruments] fetch failed", err);
    return null;
  }
}

/** Null if the dump can't be fetched or the symbol isn't in it. */
export async function getInstrumentToken(accessToken: string, tradingsymbol: string): Promise<number | null> {
  const cached = await ensureCache(accessToken);
  return cached?.tokenBySymbol.get(tradingsymbol) ?? null;
}

/**
 * For Settings' sector-symbol search (DECISIONS.md): lets the owner find
 * the real Kite tradingsymbol for an index himself (e.g. is "Nifty Bank"
 * really "BANKNIFTY" or "NIFTY BANK"?) instead of us guessing. Matches
 * against both tradingsymbol and name, case-insensitively.
 */
export async function searchIndexInstruments(accessToken: string, query: string): Promise<IndexInstrument[]> {
  const trimmed = query.trim().toUpperCase();
  if (!trimmed) return [];
  const cached = await ensureCache(accessToken);
  if (!cached) return [];
  return cached.indexInstruments
    .filter((row) => row.tradingsymbol.toUpperCase().includes(trimmed) || row.name.toUpperCase().includes(trimmed))
    .slice(0, 40);
}

/** Test-only. */
export function __resetInstrumentsCacheForTests(): void {
  cache = null;
}

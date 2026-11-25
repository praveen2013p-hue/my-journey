/**
 * TradingView ticker -> provider symbol mapping (BRIEF.md §5, §17.7). A
 * ticker the webhook has never seen gets a best-guess row with
 * `status: 'unmapped'` so the alert still saves (shows "price unavailable"
 * in the UI) and the ticker shows up in Settings -> "Unmapped symbols" for
 * Praveen to confirm — never guessed silently into something that could
 * quietly fetch the wrong stock's price.
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, nextSeq, readStore } from "./local-store";
import type { Market, SymbolMapRow } from "./schema-types";

export async function getSymbolMapping(
  market: Market,
  tvTicker: string,
): Promise<SymbolMapRow | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("symbol_map")
      .select("*")
      .eq("market", market)
      .eq("tv_ticker", tvTicker)
      .maybeSingle();
    if (error) throw error;
    return (data as SymbolMapRow) ?? null;
  }
  const store = await readStore();
  return (
    store.symbol_map.find((s) => s.market === market && s.tv_ticker === tvTicker) ?? null
  );
}

/**
 * A ticker with no special characters maps to the same string on every
 * provider for the overwhelming majority of NSE/US symbols (SBIN, TCS,
 * AAPL, ...), so it's safe to auto-map. Anything with `&`, `.`, `_` or a
 * space (M&M, BRK.B, BAJAJ_AUTO) needs a human to confirm the provider's
 * actual spelling (BAJAJ-AUTO, BRK-B, ...) — BRIEF.md §17.7.
 */
function isSimpleTicker(ticker: string): boolean {
  return /^[A-Z0-9]+$/i.test(ticker);
}

/**
 * Looks up a mapping, auto-mapping unambiguous tickers and creating an
 * `unmapped` placeholder (for a human to confirm) for anything with a
 * special character.
 */
export async function resolveOrCreateSymbolMapping(
  market: Market,
  tvTicker: string,
  exchange: string,
): Promise<SymbolMapRow> {
  const existing = await getSymbolMapping(market, tvTicker);
  if (existing) return existing;

  const simple = isSimpleTicker(tvTicker);
  const newRow = {
    market,
    tv_ticker: tvTicker,
    exchange,
    kite_symbol: simple ? tvTicker : null,
    yahoo_symbol: simple ? tvTicker : null,
    status: (simple ? "mapped" : "unmapped") as "mapped" | "unmapped",
    notes: simple ? null : "Contains a special character - confirm the provider's exact symbol.",
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("symbol_map").insert(newRow).select().single();
    if (error) throw error;
    return data as SymbolMapRow;
  }

  return mutateStore((store) => {
    const row: SymbolMapRow = { id: nextSeq(store, "symbol_map"), ...newRow };
    store.symbol_map.push(row);
    return row;
  });
}

/**
 * Same lookup as `getSymbolMapping`, but for many tickers in one round
 * trip - Breakouts/Pullbacks used to call `getSymbolMapping` once per
 * row (an N+1: one DB call per alert on the page). Returns a map keyed
 * by ticker; a ticker with no mapping row is simply absent.
 */
export async function listSymbolMappingsForTickers(
  market: Market,
  tvTickers: string[],
): Promise<Map<string, SymbolMapRow>> {
  const unique = Array.from(new Set(tvTickers));
  const result = new Map<string, SymbolMapRow>();
  if (unique.length === 0) return result;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("symbol_map")
      .select("*")
      .eq("market", market)
      .in("tv_ticker", unique);
    if (error) throw error;
    for (const row of data as SymbolMapRow[]) result.set(row.tv_ticker, row);
    return result;
  }

  const store = await readStore();
  for (const row of store.symbol_map) {
    if (row.market === market && unique.includes(row.tv_ticker)) result.set(row.tv_ticker, row);
  }
  return result;
}

export async function listUnmappedSymbols(): Promise<SymbolMapRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("symbol_map").select("*").eq("status", "unmapped");
    if (error) throw error;
    return data as SymbolMapRow[];
  }
  const store = await readStore();
  return store.symbol_map.filter((s) => s.status === "unmapped");
}

export async function updateSymbolMapping(
  id: number,
  patch: Partial<Pick<SymbolMapRow, "kite_symbol" | "yahoo_symbol" | "status" | "notes">>,
): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("symbol_map").update(patch).eq("id", id);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    const row = store.symbol_map.find((s) => s.id === id);
    if (row) Object.assign(row, patch);
  });
}

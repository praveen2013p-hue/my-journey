/**
 * Sector constituent lists, BRIEF.md §7.2: "Constituents come from an
 * uploadable CSV per sector (Settings -> admin upload) with a monthly
 * refresh reminder." An upload replaces the sector's whole list (the CSV
 * is the new source of truth for that sector, not a diff to merge).
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { Market, SectorConstituentRow } from "./schema-types";
import { listSymbolMappingsForTickers } from "./symbol-map";

export async function replaceConstituents(
  market: Market,
  sector: string,
  tickers: string[],
): Promise<void> {
  const uniqueTickers = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)));
  const updated_at = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error: deleteError } = await supabase
      .from("sector_constituents")
      .delete()
      .eq("market", market)
      .eq("sector", sector);
    if (deleteError) throw deleteError;
    if (uniqueTickers.length === 0) return;
    const { error: insertError } = await supabase
      .from("sector_constituents")
      .insert(uniqueTickers.map((ticker) => ({ market, sector, ticker, updated_at })));
    if (insertError) throw insertError;
    return;
  }

  await mutateStore((store) => {
    store.sector_constituents = store.sector_constituents.filter(
      (c) => !(c.market === market && c.sector === sector),
    );
    let nextId = store.sector_constituents.reduce((max, c) => Math.max(max, c.id), 0);
    for (const ticker of uniqueTickers) {
      nextId += 1;
      store.sector_constituents.push({ id: nextId, market, sector, ticker, updated_at });
    }
  });
}

export async function listConstituents(market: Market, sector: string): Promise<string[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sector_constituents")
      .select("ticker")
      .eq("market", market)
      .eq("sector", sector);
    if (error) throw error;
    return data.map((r) => r.ticker);
  }
  const store = await readStore();
  return store.sector_constituents
    .filter((c) => c.market === market && c.sector === sector)
    .map((c) => c.ticker);
}

/** Every sector a ticker belongs to, for the side panel's sector context and the Quality Score (BRIEF.md §9). */
export async function listSectorsForTicker(market: Market, ticker: string): Promise<string[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sector_constituents")
      .select("sector")
      .eq("market", market)
      .eq("ticker", ticker);
    if (error) throw error;
    return data.map((r) => r.sector);
  }
  const store = await readStore();
  return store.sector_constituents.filter((c) => c.market === market && c.ticker === ticker).map((c) => c.sector);
}

/** Which sectors (for this market) have at least one uploaded constituent - the rest show "no constituents uploaded". */
export async function listSectorsWithConstituents(market: Market): Promise<Set<string>> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("sector_constituents").select("sector").eq("market", market);
    if (error) throw error;
    return new Set(data.map((r) => r.sector));
  }
  const store = await readStore();
  return new Set(
    store.sector_constituents.filter((c) => c.market === market).map((c) => c.sector),
  );
}

/** Every sector's constituent tickers for a market, in one query - used to compute breadth stats across all sectors at once. */
export async function listConstituentsBySector(market: Market): Promise<Map<string, string[]>> {
  const bySector = new Map<string, string[]>();
  const add = (sector: string, ticker: string) => {
    const list = bySector.get(sector) ?? [];
    list.push(ticker);
    bySector.set(sector, list);
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("sector_constituents").select("sector, ticker").eq("market", market);
    if (error) throw error;
    for (const row of data as Array<Pick<SectorConstituentRow, "sector" | "ticker">>) add(row.sector, row.ticker);
    return bySector;
  }

  const store = await readStore();
  for (const row of store.sector_constituents) {
    if (row.market !== market) continue;
    add(row.sector, row.ticker);
  }
  return bySector;
}

export async function getConstituentCounts(market: Market): Promise<Record<string, number>> {
  const store = isSupabaseConfigured() ? null : await readStore();
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("sector_constituents").select("sector").eq("market", market);
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of data as Array<Pick<SectorConstituentRow, "sector">>) {
      counts[row.sector] = (counts[row.sector] ?? 0) + 1;
    }
    return counts;
  }
  const counts: Record<string, number> = {};
  for (const row of store!.sector_constituents) {
    if (row.market !== market) continue;
    counts[row.sector] = (counts[row.sector] ?? 0) + 1;
  }
  return counts;
}

export interface ConstituentQuoteRow {
  ticker: string;
  /** Null when this ticker has never appeared in an alert yet - no symbol_map row to read an exchange from. */
  exchange: string | null;
  /** Null when unmapped - same "never guess" rule as everywhere else (BRIEF.md §17.7). */
  providerSymbol: string | null;
}

/**
 * A sector's constituent tickers, resolved against `symbol_map` (one
 * batched query, not one per ticker - same N+1 lesson as
 * lib/breakouts-data.ts) so the caller can fetch live quotes for them.
 * A constituent that's never appeared in an alert has no symbol_map row
 * yet, so it shows up with `providerSymbol: null` - "price unavailable,"
 * never a guess.
 */
export async function getConstituentQuoteRows(market: Market, sector: string): Promise<ConstituentQuoteRow[]> {
  const tickers = await listConstituents(market, sector);
  if (tickers.length === 0) return [];

  const mappings = await listSymbolMappingsForTickers(market, tickers);
  return tickers
    .map((ticker) => {
      const mapping = mappings.get(ticker);
      return {
        ticker,
        exchange: mapping?.exchange ?? null,
        providerSymbol:
          mapping?.status === "mapped" ? (market === "IN" ? mapping.kite_symbol : mapping.yahoo_symbol) : null,
      };
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

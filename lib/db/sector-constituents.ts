/**
 * Sector constituent lists, BRIEF.md §7.2: "Constituents come from an
 * uploadable CSV per sector (Settings -> admin upload) with a monthly
 * refresh reminder." An upload replaces the sector's whole list (the CSV
 * is the new source of truth for that sector, not a diff to merge).
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { Market, SectorConstituentRow } from "./schema-types";

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

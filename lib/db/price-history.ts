/**
 * Repository for `price_history` - daily closes kept only for triggered
 * tickers and tickers in trades (BRIEF.md §17.5), used by the Performance
 * page's "if I had held" and shortlist-performance stats (§15).
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { Market, PriceHistoryRow } from "./schema-types";

export async function listPriceHistory(
  market: Market,
  ticker: string,
  fromDate: string,
  toDate: string,
): Promise<PriceHistoryRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("price_history")
      .select("*")
      .eq("market", market)
      .eq("ticker", ticker)
      .gte("date", fromDate)
      .lte("date", toDate)
      .order("date", { ascending: true });
    if (error) throw error;
    return data as PriceHistoryRow[];
  }
  const store = await readStore();
  return store.price_history
    .filter((p) => p.market === market && p.ticker === ticker && p.date >= fromDate && p.date <= toDate)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Every stored date for a ticker, for figuring out what's still missing before fetching. */
export async function listPriceHistoryDates(market: Market, ticker: string): Promise<Set<string>> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("price_history")
      .select("date")
      .eq("market", market)
      .eq("ticker", ticker);
    if (error) throw error;
    return new Set((data as Array<{ date: string }>).map((r) => r.date));
  }
  const store = await readStore();
  return new Set(
    store.price_history.filter((p) => p.market === market && p.ticker === ticker).map((p) => p.date),
  );
}

export async function upsertPriceHistoryBars(
  market: Market,
  ticker: string,
  bars: Array<{ date: string; close: number }>,
): Promise<void> {
  if (bars.length === 0) return;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("price_history").upsert(
      bars.map((b) => ({ market, ticker, date: b.date, close: b.close, adjustment_factor: 1 })),
      { onConflict: "market,ticker,date" },
    );
    if (error) throw error;
    return;
  }

  await mutateStore((store) => {
    for (const bar of bars) {
      const idx = store.price_history.findIndex(
        (p) => p.market === market && p.ticker === ticker && p.date === bar.date,
      );
      if (idx >= 0) {
        store.price_history[idx].close = bar.close;
      } else {
        store.price_history.push({
          id: store.price_history.length + 1,
          market,
          ticker,
          date: bar.date,
          close: bar.close,
          adjustment_factor: 1,
        });
      }
    }
  });
}

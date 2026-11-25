/**
 * US data via Yahoo Finance (free, unofficial, ~15 min delayed — BRIEF.md
 * §2). Never throws: per §17.5 "Yahoo failures must never break pages,"
 * every method swallows errors and returns an empty/partial result so the
 * caller can fall back to a stale/last-good price instead of crashing.
 */

import YahooFinance from "yahoo-finance2";
import type { DailyBar, MarketDataProvider, ProviderQuote, WeeklyBar } from "./types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export class YahooMarketDataProvider implements MarketDataProvider {
  readonly name = "yahoo";

  async getQuotes(symbols: string[]): Promise<Map<string, ProviderQuote>> {
    const result = new Map<string, ProviderQuote>();
    if (symbols.length === 0) return result;

    try {
      const quotes = await yahooFinance.quote(symbols, { return: "map" });
      const now = new Date().toISOString();
      for (const symbol of symbols) {
        const q = quotes.get(symbol);
        if (!q) continue;
        const price = q.regularMarketPrice;
        if (typeof price !== "number") continue;
        result.set(symbol, {
          symbol,
          price,
          previousClose: typeof q.regularMarketPreviousClose === "number" ? q.regularMarketPreviousClose : null,
          asOf: q.regularMarketTime ? new Date(q.regularMarketTime).toISOString() : now,
          delayed: true,
        });
      }
    } catch (err) {
      console.error("[yahoo provider] getQuotes failed", err);
    }
    return result;
  }

  async getWeeklyHistory(symbol: string, weeks: number): Promise<WeeklyBar[]> {
    try {
      const period1 = new Date();
      period1.setDate(period1.getDate() - weeks * 7 - 14);
      const chart = await yahooFinance.chart(symbol, { period1, interval: "1wk" });
      return chart.quotes
        .filter((q): q is typeof q & { close: number } => typeof q.close === "number")
        .map((q) => ({
          weekEnding: new Date(q.date).toISOString().slice(0, 10),
          close: q.close,
          volume: q.volume ?? 0,
        }));
    } catch (err) {
      console.error("[yahoo provider] getWeeklyHistory failed", err);
      return [];
    }
  }

  async getDailyHistory(symbol: string, fromDate: string, toDate: string): Promise<DailyBar[]> {
    try {
      const period1 = new Date(`${fromDate}T00:00:00Z`);
      const period2 = new Date(`${toDate}T23:59:59Z`);
      const chart = await yahooFinance.chart(symbol, { period1, period2, interval: "1d" });
      return chart.quotes
        .filter((q): q is typeof q & { close: number } => typeof q.close === "number")
        .map((q) => ({
          date: new Date(q.date).toISOString().slice(0, 10),
          close: q.close,
          volume: typeof q.volume === "number" ? q.volume : null,
        }));
    } catch (err) {
      console.error("[yahoo provider] getDailyHistory failed", err);
      return [];
    }
  }
}

/**
 * India live data via Zerodha Kite Connect (BRIEF.md §2/§10). Never
 * throws: every method returns an empty/partial result on a missing
 * token, expired session, or API failure, so the caller falls back to
 * last-good data instead of crashing (§17.5).
 *
 * Only ever called with a real, already-validated access token
 * (lib/db/provider-session.ts's getZerodhaSession() returns null for an
 * expired one), so "no session" here always just means "not connected
 * yet" or "needs a reconnect" - never a bug to fix.
 */

import { getZerodhaSession } from "../db/provider-session";
import { createRateLimiter } from "../rate-limiter";
import { weekEndingForAlert } from "../time";
import { getInstrumentToken } from "../zerodha/instruments";
import type { DailyBar, MarketDataProvider, ProviderQuote, WeeklyBar } from "./types";

const KITE_BASE = "https://api.kite.trade";

/**
 * BRIEF.md §7.2/§11: "Kite historical allows ~3 requests/second." Quotes
 * are exempt - one batched call covers any number of symbols - but every
 * historical-candles call is its own request, and callers like the
 * sector-metrics recompute or Performance's shortlist can easily want
 * dozens of them at once. One shared limiter per process, not per call
 * site, so it holds regardless of which page or job triggered the calls.
 */
const historicalRateLimit = createRateLimiter(3);

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `token ${process.env.KITE_API_KEY}:${accessToken}`,
    "X-Kite-Version": "3",
  };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * sector_map's provider_symbol is stored TradingView-style with an exchange
 * prefix (e.g. "NSE:BANKNIFTY" - DECISIONS.md), but Kite's instruments
 * dump keys tradingsymbol without one. Stock tickers never carry a prefix,
 * so this is a no-op for them.
 */
export function stripExchangePrefix(symbol: string): string {
  const colonIdx = symbol.indexOf(":");
  return colonIdx >= 0 ? symbol.slice(colonIdx + 1) : symbol;
}

interface DailyCandle {
  date: string;
  close: number;
  volume: number;
}

async function fetchDailyCandles(
  accessToken: string,
  instrumentToken: number,
  fromDate: string,
  toDate: string,
): Promise<DailyCandle[]> {
  const url = `${KITE_BASE}/instruments/historical/${instrumentToken}/day?from=${fromDate}&to=${toDate}`;
  const response = await historicalRateLimit(() => fetch(url, { headers: authHeaders(accessToken) }));
  if (!response.ok) return [];

  const body = (await response.json().catch(() => null)) as { data?: { candles?: unknown[] } } | null;
  const candles = body?.data?.candles;
  if (!Array.isArray(candles)) return [];

  return candles
    .map((row) => {
      const [date, , , , close, volume] = row as [string, number, number, number, number, number];
      return { date: String(date).slice(0, 10), close: Number(close), volume: Number(volume) };
    })
    .filter((c): c is DailyCandle => Number.isFinite(c.close));
}

export class KiteMarketDataProvider implements MarketDataProvider {
  readonly name = "kite";

  async getQuotes(symbols: string[]): Promise<Map<string, ProviderQuote>> {
    const result = new Map<string, ProviderQuote>();
    if (symbols.length === 0) return result;

    const session = await getZerodhaSession();
    if (!session) return result;

    try {
      const params = new URLSearchParams();
      for (const symbol of symbols) params.append("i", `NSE:${symbol}`);
      const response = await fetch(`${KITE_BASE}/quote?${params.toString()}`, {
        headers: authHeaders(session.accessToken),
      });
      if (!response.ok) return result;

      const body = (await response.json().catch(() => null)) as {
        data?: Record<string, { last_price?: number; ohlc?: { close?: number } }>;
      } | null;
      const now = new Date().toISOString();

      for (const symbol of symbols) {
        const row = body?.data?.[`NSE:${symbol}`];
        if (!row || typeof row.last_price !== "number") continue;
        result.set(symbol, {
          symbol,
          price: row.last_price,
          previousClose: typeof row.ohlc?.close === "number" ? row.ohlc.close : null,
          asOf: now,
          delayed: false,
        });
      }
    } catch (err) {
      console.error("[kite provider] getQuotes failed", err);
    }
    return result;
  }

  async getWeeklyHistory(symbol: string, weeks: number): Promise<WeeklyBar[]> {
    try {
      const session = await getZerodhaSession();
      if (!session) return [];
      const token = await getInstrumentToken(session.accessToken, stripExchangePrefix(symbol));
      if (!token) return [];

      const to = new Date();
      const from = new Date(to.getTime() - (weeks * 7 + 14) * 86_400_000);
      const candles = await fetchDailyCandles(session.accessToken, token, toIsoDate(from), toIsoDate(to));

      // Kite has no weekly interval (DECISIONS.md) - group daily candles
      // into Friday-ending weeks ourselves; chronological order means the
      // last candle written per week is that week's closing price.
      const byWeek = new Map<string, { close: number; volume: number }>();
      for (const c of candles) {
        const weekEnding = weekEndingForAlert(new Date(`${c.date}T12:00:00+05:30`), "IN");
        const existing = byWeek.get(weekEnding);
        byWeek.set(weekEnding, { close: c.close, volume: (existing?.volume ?? 0) + c.volume });
      }

      return Array.from(byWeek.entries())
        .map(([weekEnding, v]) => ({ weekEnding, close: v.close, volume: v.volume }))
        .sort((a, b) => (a.weekEnding < b.weekEnding ? -1 : 1))
        .slice(-weeks);
    } catch (err) {
      console.error("[kite provider] getWeeklyHistory failed", err);
      return [];
    }
  }

  async getDailyHistory(symbol: string, fromDate: string, toDate: string): Promise<DailyBar[]> {
    try {
      const session = await getZerodhaSession();
      if (!session) return [];
      const token = await getInstrumentToken(session.accessToken, stripExchangePrefix(symbol));
      if (!token) return [];

      const candles = await fetchDailyCandles(session.accessToken, token, fromDate, toDate);
      return candles.map((c) => ({ date: c.date, close: c.close }));
    } catch (err) {
      console.error("[kite provider] getDailyHistory failed", err);
      return [];
    }
  }
}

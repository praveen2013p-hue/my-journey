/**
 * Deterministic, synthetic prices — no network call, no API key. BRIEF.md
 * §2: "build and test with a mock provider first." Prices are plausible
 * but not real data: they drift slowly (minute-bucketed) so repeated
 * requests look "live" without actually being random noise on every call.
 */

import type { MarketDataProvider, ProviderQuote, WeeklyBar } from "./types";

function hashSymbol(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** A stable base price in a plausible range, purely a function of the symbol string. */
function basePrice(symbol: string): number {
  const hash = hashSymbol(symbol);
  return 50 + (hash % 4000); // ~50-4050
}

function driftFactor(symbol: string, atMinute: number): number {
  const hash = hashSymbol(symbol);
  // Slow sine drift (+/-4%) plus a per-symbol phase offset so symbols don't move in lockstep.
  return 1 + 0.04 * Math.sin(atMinute / 45 + (hash % 1000));
}

export class MockMarketDataProvider implements MarketDataProvider {
  readonly name = "mock";

  async getQuotes(symbols: string[]): Promise<Map<string, ProviderQuote>> {
    const now = new Date();
    const minuteBucket = Math.floor(now.getTime() / 60_000);
    const result = new Map<string, ProviderQuote>();

    for (const symbol of symbols) {
      const base = basePrice(symbol);
      const price = Math.round(base * driftFactor(symbol, minuteBucket) * 100) / 100;
      const previousClose = Math.round(base * driftFactor(symbol, minuteBucket - 1440) * 100) / 100;
      result.set(symbol, {
        symbol,
        price,
        previousClose,
        asOf: now.toISOString(),
        delayed: false,
      });
    }
    return result;
  }

  async getWeeklyHistory(symbol: string, weeks: number): Promise<WeeklyBar[]> {
    const hash = hashSymbol(symbol);
    const base = basePrice(symbol);
    const bars: WeeklyBar[] = [];

    // A mild uptrend with noise, ending near today's mock live price, so the
    // 30W MA and the breakout-level line have something sensible to render.
    let price = base * 0.75;
    const today = new Date();
    for (let i = weeks - 1; i >= 0; i--) {
      const weekEnding = new Date(today);
      weekEnding.setDate(weekEnding.getDate() - i * 7);
      const noise = Math.sin((hash % 97) + i * 0.7) * 0.015;
      const trend = 0.004;
      price = Math.max(1, price * (1 + trend + noise));
      const volume = Math.round(100_000 + ((hash + i * 37) % 900_000));
      bars.push({
        weekEnding: weekEnding.toISOString().slice(0, 10),
        close: Math.round(price * 100) / 100,
        volume,
      });
    }
    return bars;
  }
}

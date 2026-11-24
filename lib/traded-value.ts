/**
 * The two §16/§7.2 metrics that need provider price history rather than
 * the webhook's own numbers: the sector index's own 1-week price change,
 * and the constituents' traded value (Σ close × volume) vs its 10-week
 * average. Both return nulls rather than guessing when the data isn't
 * there yet (no resolved index symbol, no uploaded constituents).
 */

import type { Market } from "./db/schema-types";
import { getProviderForMarket } from "./providers";

export interface TradedValueResult {
  tradedValue: number | null;
  tvAvg10: number | null;
  tvRatio: number | null;
  tradedValueChg1w: number | null;
}

const EMPTY_RESULT: TradedValueResult = {
  tradedValue: null,
  tvAvg10: null,
  tvRatio: null,
  tradedValueChg1w: null,
};

export async function computeTradedValue(
  market: Market,
  tickers: string[],
  weekEnding: string,
): Promise<TradedValueResult> {
  if (tickers.length === 0) return EMPTY_RESULT;

  const provider = getProviderForMarket(market);
  // current week + 10-week average + one more week for the 1W comparison.
  const histories = await Promise.all(tickers.map((t) => provider.getWeeklyHistory(t, 16)));

  const sumsByWeek = new Map<string, number>();
  for (const history of histories) {
    for (const bar of history) {
      sumsByWeek.set(bar.weekEnding, (sumsByWeek.get(bar.weekEnding) ?? 0) + bar.close * bar.volume);
    }
  }

  const weeks = Array.from(sumsByWeek.keys()).sort();
  const currentIndex = weeks.indexOf(weekEnding);
  if (currentIndex === -1) return EMPTY_RESULT;

  const tradedValue = sumsByWeek.get(weekEnding) ?? null;
  const prior10 = weeks.slice(Math.max(0, currentIndex - 10), currentIndex).map((w) => sumsByWeek.get(w)!);
  const tvAvg10 = prior10.length > 0 ? prior10.reduce((a, b) => a + b, 0) / prior10.length : null;
  const tvRatio = tradedValue !== null && tvAvg10 ? tradedValue / tvAvg10 : null;

  const previousWeekValue = currentIndex > 0 ? (sumsByWeek.get(weeks[currentIndex - 1]) ?? null) : null;
  const tradedValueChg1w =
    tradedValue !== null && previousWeekValue !== null && previousWeekValue !== 0
      ? ((tradedValue - previousWeekValue) / previousWeekValue) * 100
      : null;

  return { tradedValue, tvAvg10, tvRatio, tradedValueChg1w };
}

/** §16's "1W price": the sector's own index/ETF % change vs the prior weekly close. Null when the index has no resolved provider symbol. */
export async function computeSectorIndexPriceChange1w(
  market: Market,
  providerSymbol: string | null,
): Promise<number | null> {
  if (!providerSymbol) return null;
  const provider = getProviderForMarket(market);
  const bars = await provider.getWeeklyHistory(providerSymbol, 2);
  if (bars.length < 2) return null;
  const [prev, curr] = bars.slice(-2);
  if (prev.close === 0) return null;
  return ((curr.close - prev.close) / prev.close) * 100;
}

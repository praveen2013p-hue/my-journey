/**
 * On-demand (not a real nightly cron - DECISIONS.md) backfill of daily
 * closes for one ticker, used by the Performance page (BRIEF.md §15).
 * Only ever called for triggered tickers / tickers in trades (§17.5), and
 * only re-fetches from the provider when the most recent trading day
 * isn't already stored, so a repeat page view doesn't re-hit the
 * provider on every render.
 */

import { format } from "date-fns";
import { listPriceHistory, listPriceHistoryDates, upsertPriceHistoryBars } from "./db/price-history";
import type { Market } from "./db/schema-types";
import type { PriceHistoryRow } from "./db/schema-types";
import { getProviderForMarket } from "./providers";

function mostRecentWeekday(from: Date): Date {
  const d = new Date(from);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

export async function ensureDailyHistory(
  market: Market,
  ticker: string,
  providerSymbol: string | null,
  fromDate: string,
  toDate: string,
): Promise<void> {
  if (!providerSymbol) return;

  const expectedLatest = format(mostRecentWeekday(new Date(`${toDate}T00:00:00Z`)), "yyyy-MM-dd");
  const existingDates = await listPriceHistoryDates(market, ticker);
  if (existingDates.has(expectedLatest)) return;

  const provider = getProviderForMarket(market);
  const bars = await provider.getDailyHistory(providerSymbol, fromDate, toDate);
  await upsertPriceHistoryBars(market, ticker, bars);
}

export async function getDailyHistoryWithBackfill(
  market: Market,
  ticker: string,
  providerSymbol: string | null,
  fromDate: string,
  toDate: string,
): Promise<PriceHistoryRow[]> {
  await ensureDailyHistory(market, ticker, providerSymbol, fromDate, toDate);
  return listPriceHistory(market, ticker, fromDate, toDate);
}

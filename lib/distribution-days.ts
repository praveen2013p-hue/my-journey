/**
 * "Distribution-day counter" (DECISIONS.md backlog): high-volume down
 * days on the benchmark index, an early Stage-3/top warning (the classic
 * IBD/O'Neil definition - a day the index closes down >=0.2% on volume
 * higher than the prior day's). Scoped to the benchmark only (one
 * symbol), never every stock - that keeps this cheap under Kite's daily
 * historical-data rate limit, unlike a full market-breadth computation.
 */

import { BENCHMARK_SYMBOL } from "./regime";
import type { Market } from "./db/schema-types";
import type { DailyBar } from "./providers/types";
import { getProviderForMarket } from "./providers";

const WINDOW_SESSIONS = 25;
const DOWN_THRESHOLD_PCT = -0.2;

export interface DistributionDayResult {
  market: Market;
  benchmarkSymbol: string;
  windowSessions: number;
  /** Null when there isn't enough daily volume history to compute this reliably - never a guessed count. */
  count: number | null;
}

/** Pure counting logic over already-fetched bars, oldest first - easy to test without a provider. */
export function countDistributionDays(bars: DailyBar[], windowSessions = WINDOW_SESSIONS): number | null {
  const recent = bars.slice(-(windowSessions + 1));
  if (recent.length < 2 || recent.some((b) => b.volume === null)) return null;

  let count = 0;
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1];
    const cur = recent[i];
    const pctChange = ((cur.close - prev.close) / prev.close) * 100;
    if (pctChange <= DOWN_THRESHOLD_PCT && cur.volume! > prev.volume!) count += 1;
  }
  return count;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getDistributionDayCount(market: Market): Promise<DistributionDayResult> {
  const benchmarkSymbol = BENCHMARK_SYMBOL[market];
  const provider = getProviderForMarket(market);
  const to = new Date();
  // Trading sessions skip weekends (and holidays) - a wide calendar-day
  // buffer so WINDOW_SESSIONS+1 real sessions are reliably inside it.
  const from = new Date(to.getTime() - (WINDOW_SESSIONS * 1.6 + 14) * 86_400_000);
  const bars = await provider.getDailyHistory(benchmarkSymbol, toIsoDate(from), toIsoDate(to));

  return {
    market,
    benchmarkSymbol,
    windowSessions: WINDOW_SESSIONS,
    count: countDistributionDays(bars),
  };
}

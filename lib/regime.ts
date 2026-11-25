/**
 * Market regime light, BRIEF.md §8: India from Nifty Total Market, US from
 * the S&P 500, Stage computed the same way as a stock's (lib/weinstein.ts)
 * over the benchmark's own weekly closes.
 */

import type { Market } from "./db/schema-types";
import { getProviderForMarket } from "./providers";
import { weinsteinStage, type Stage } from "./weinstein";

/**
 * India's benchmark has no confirmed Kite instrument yet (no Zerodha
 * connection to resolve it against, same honesty principle as the
 * sector_map seed) - mock until then. US resolves to Yahoo's real S&P 500
 * ticker, so this already uses live data once network access allows it.
 */
export const BENCHMARK_SYMBOL: Record<Market, string> = {
  IN: "NIFTY_TOTAL_MKT",
  US: "^GSPC",
};

export interface MarketRegime {
  market: Market;
  stage: Stage | null;
  /** Stage 3 or 4 - BRIEF.md §8's red-banner trigger. */
  isWeak: boolean;
}

// Every (app) page computes this via the layout, and a weekly-history call
// is too slow/network-dependent to repeat on every navigation (especially
// when Yahoo is unreachable, per BRIEF.md §17.5's "never break pages").
// An hour-old regime is still correct at weekly granularity, so a short
// in-memory cache is enough - no separate cron needed for Phase 2.
const REGIME_CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<Market, { regime: MarketRegime; cachedAt: number }>();

export async function getMarketRegime(market: Market): Promise<MarketRegime> {
  const cached = cache.get(market);
  if (cached && Date.now() - cached.cachedAt < REGIME_CACHE_TTL_MS) {
    return cached.regime;
  }

  const provider = getProviderForMarket(market);
  const bars = await provider.getWeeklyHistory(BENCHMARK_SYMBOL[market], 60);
  const { stage } = weinsteinStage(bars.map((b) => b.close));
  const regime: MarketRegime = { market, stage, isWeak: stage === 3 || stage === 4 };

  // A fetch failure (Yahoo unreachable) leaves `bars` empty and `stage`
  // null - still cache it, so a down provider doesn't mean a slow call on
  // every single page load until it recovers.
  cache.set(market, { regime, cachedAt: Date.now() });
  return regime;
}

export async function getBothMarketRegimes(): Promise<{ india: MarketRegime; us: MarketRegime }> {
  const [india, us] = await Promise.all([getMarketRegime("IN"), getMarketRegime("US")]);
  return { india, us };
}

export function __clearRegimeCacheForTests(): void {
  cache.clear();
}

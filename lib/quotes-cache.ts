/**
 * Server-side quote cache, BRIEF.md §17.5: "one fetch per symbol per
 * 30-60s, shared by both users and all tabs." A provider failure (or a
 * symbol the provider has nothing for right now) falls back to the last
 * good cached value, marked `stale`, rather than ever showing nothing or
 * crashing the page.
 */

import type { Market } from "./db/schema-types";
import { getProviderForMarket } from "./providers";
import type { ProviderQuote } from "./providers/types";

const CACHE_TTL_MS = 45_000;

interface CacheEntry {
  quote: ProviderQuote;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface CachedQuote extends ProviderQuote {
  stale: boolean;
}

export async function getCachedQuotes(
  market: Market,
  symbols: string[],
): Promise<Map<string, CachedQuote>> {
  const now = Date.now();
  const result = new Map<string, CachedQuote>();
  const toFetch: string[] = [];

  for (const symbol of symbols) {
    const key = `${market}:${symbol}`;
    const entry = cache.get(key);
    if (entry && now - entry.cachedAt < CACHE_TTL_MS) {
      result.set(symbol, { ...entry.quote, stale: false });
    } else {
      toFetch.push(symbol);
    }
  }

  if (toFetch.length > 0) {
    const provider = getProviderForMarket(market);
    const fetched = await provider.getQuotes(toFetch);
    for (const symbol of toFetch) {
      const key = `${market}:${symbol}`;
      const quote = fetched.get(symbol);
      if (quote) {
        cache.set(key, { quote, cachedAt: now });
        result.set(symbol, { ...quote, stale: false });
        continue;
      }
      // Provider returned nothing for this symbol right now - fall back to
      // the last good value we have, however old, rather than show nothing.
      const lastGood = cache.get(key);
      if (lastGood) result.set(symbol, { ...lastGood.quote, stale: true });
    }
  }

  return result;
}

export function __clearQuoteCacheForTests(): void {
  cache.clear();
}

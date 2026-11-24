import type { Market } from "../db/schema-types";
import { KiteMarketDataProvider } from "./kite";
import { MockMarketDataProvider } from "./mock";
import type { MarketDataProvider } from "./types";
import { YahooMarketDataProvider } from "./yahoo";

const mock = new MockMarketDataProvider();
const yahoo = new YahooMarketDataProvider();
const kite = new KiteMarketDataProvider();

/**
 * India uses the real Kite provider once KITE_API_KEY/KITE_API_SECRET
 * are set (BRIEF.md §2/§10) - mock only before that. Once configured,
 * this never falls back to mock again just because today's daily Kite
 * login has expired: KiteMarketDataProvider's own methods already return
 * empty on no/expired session, and the quotes cache's existing "show the
 * last good value, marked stale" behaviour is the correct fallback for
 * that (§10's "fall back to last close, never crash") - swapping to
 * fabricated mock numbers here instead would be worse, not better. US
 * uses the real Yahoo provider by default since it's free; set
 * `FORCE_MOCK_US=true` to use the mock instead (e.g. for an offline demo).
 */
export function getProviderForMarket(market: Market): MarketDataProvider {
  if (market === "IN") return process.env.KITE_API_KEY ? kite : mock;
  if (process.env.FORCE_MOCK_US === "true") return mock;
  return yahoo;
}

import type { Market } from "../db/schema-types";
import { MockMarketDataProvider } from "./mock";
import type { MarketDataProvider } from "./types";
import { YahooMarketDataProvider } from "./yahoo";

const mock = new MockMarketDataProvider();
const yahoo = new YahooMarketDataProvider();

/**
 * India has no real provider wired in yet (Zerodha Kite needs Praveen's
 * paid plan + OAuth connection, BRIEF.md §2/§10) — mock until then. US
 * uses the real Yahoo provider by default since it's free; set
 * `FORCE_MOCK_US=true` to use the mock instead (e.g. for an offline demo).
 */
export function getProviderForMarket(market: Market): MarketDataProvider {
  if (market === "IN") return mock;
  if (process.env.FORCE_MOCK_US === "true") return mock;
  return yahoo;
}

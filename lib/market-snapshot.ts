/**
 * Dashboard's "Market snapshot" widget (replaces the old Open trades/P&L
 * widget there - that data already lives on the Journal page). Shows
 * broad index levels, not individual stocks: Nifty 50, Sensex, Nifty
 * Midcap 100, Nifty Smallcap 100 for India; S&P 500, Nasdaq, Dow Jones
 * for US.
 *
 * India only ever uses Kite (never Yahoo): Yahoo has no reliable
 * Midcap/Smallcap-100 ticker, and this app's own stated principle for
 * India is "show unavailable, don't substitute a different provider's
 * numbers" (lib/providers/index.ts) - so when Zerodha isn't connected,
 * every India index shows "unavailable" rather than three real numbers
 * and two silently-wrong ones. `kite.getIndexQuotes` already returns an
 * empty map with no session, so this needs no connection check of its
 * own. US goes through `getProviderForMarket` (not the Yahoo singleton
 * directly) so `FORCE_MOCK_US` keeps working the same way it does
 * everywhere else in the app, for tests and offline demos.
 */

import type { Market } from "./db/schema-types";
import { getProviderForMarket, kite } from "./providers";

export interface MarketSnapshotItem {
  label: string;
  value: number | null;
  changePct: number | null;
  unavailable: boolean;
}

const INDIA_INDICES: Array<{ label: string; exchange: "NSE" | "BSE"; symbol: string }> = [
  { label: "Nifty 50", exchange: "NSE", symbol: "NIFTY 50" },
  { label: "Sensex", exchange: "BSE", symbol: "SENSEX" },
  { label: "Nifty Midcap 100", exchange: "NSE", symbol: "NIFTY MIDCAP 100" },
  { label: "Nifty Smallcap 100", exchange: "NSE", symbol: "NIFTY SMLCAP 100" },
];

const US_INDICES: Array<{ label: string; symbol: string }> = [
  { label: "S&P 500", symbol: "^GSPC" },
  { label: "Nasdaq", symbol: "^IXIC" },
  { label: "Dow Jones", symbol: "^DJI" },
];

function changePct(price: number, previousClose: number | null): number | null {
  if (previousClose === null || previousClose === 0) return null;
  return ((price - previousClose) / previousClose) * 100;
}

async function getIndiaSnapshot(): Promise<MarketSnapshotItem[]> {
  const quotes = await kite.getIndexQuotes(INDIA_INDICES.map((i) => ({ exchange: i.exchange, symbol: i.symbol })));
  return INDIA_INDICES.map((i) => {
    const q = quotes.get(`${i.exchange}:${i.symbol}`);
    return {
      label: i.label,
      value: q?.price ?? null,
      changePct: q ? changePct(q.price, q.previousClose) : null,
      unavailable: !q,
    };
  });
}

async function getUsSnapshot(): Promise<MarketSnapshotItem[]> {
  const provider = getProviderForMarket("US");
  const quotes = await provider.getQuotes(US_INDICES.map((i) => i.symbol));
  return US_INDICES.map((i) => {
    const q = quotes.get(i.symbol);
    return {
      label: i.label,
      value: q?.price ?? null,
      changePct: q ? changePct(q.price, q.previousClose) : null,
      unavailable: !q,
    };
  });
}

export async function getMarketSnapshot(market: Market): Promise<MarketSnapshotItem[]> {
  return market === "IN" ? getIndiaSnapshot() : getUsSnapshot();
}

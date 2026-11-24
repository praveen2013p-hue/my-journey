import type { Market } from "./db/schema-types";

const EXCHANGE_TO_MARKET: Record<string, Market> = {
  NSE: "IN",
  BSE: "IN",
  NYSE: "US",
  NASDAQ: "US",
  AMEX: "US",
  CBOE: "US",
};

/** BRIEF.md §5: NSE/BSE -> IN; NYSE/NASDAQ/AMEX/CBOE -> US. */
export function marketFromExchange(exchange: string): Market | null {
  return EXCHANGE_TO_MARKET[exchange.toUpperCase()] ?? null;
}

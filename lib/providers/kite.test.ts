import { describe, expect, it } from "vitest";
import { stripExchangePrefix } from "./kite";

describe("stripExchangePrefix", () => {
  it("strips a TradingView-style exchange prefix", () => {
    expect(stripExchangePrefix("NSE:BANKNIFTY")).toBe("BANKNIFTY");
    expect(stripExchangePrefix("AMEX:XLK")).toBe("XLK");
  });

  it("is a no-op for a plain tradingsymbol (stock tickers never carry a prefix)", () => {
    expect(stripExchangePrefix("RELIANCE")).toBe("RELIANCE");
  });
});

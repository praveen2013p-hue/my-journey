import { describe, expect, it } from "vitest";
import { computeSectorIndexPriceChange1w, computeTradedValue } from "./traded-value";
import { getProviderForMarket } from "./providers";

describe("computeTradedValue", () => {
  it("returns all nulls with no constituents, rather than a fake zero", async () => {
    const result = await computeTradedValue("IN", [], "2026-11-20");
    expect(result).toEqual({ tradedValue: null, tvAvg10: null, tvRatio: null, tradedValueChg1w: null });
  });

  it("sums close*volume across constituents for the target week, using the mock provider", async () => {
    const provider = getProviderForMarket("IN");
    const bars = await provider.getWeeklyHistory("SBIN", 16);
    const weekEnding = bars[bars.length - 1].weekEnding;

    const result = await computeTradedValue("IN", ["SBIN", "TCS"], weekEnding);
    expect(result.tradedValue).not.toBeNull();
    expect(result.tradedValue).toBeGreaterThan(0);
    expect(result.tvAvg10).not.toBeNull();
    expect(result.tvRatio).not.toBeNull();
  });

  it("returns nulls when the requested week isn't in the fetched history", async () => {
    const result = await computeTradedValue("IN", ["SBIN"], "1999-01-01");
    expect(result.tradedValue).toBeNull();
  });
});

describe("computeSectorIndexPriceChange1w", () => {
  it("is null when there is no resolved provider symbol", async () => {
    expect(await computeSectorIndexPriceChange1w("IN", null)).toBeNull();
  });

  it("computes a % change between the last two weekly bars for a resolved symbol", async () => {
    const result = await computeSectorIndexPriceChange1w("IN", "NIFTY_BANK_MOCK");
    expect(result).not.toBeNull();
    expect(Number.isFinite(result)).toBe(true);
  });
});

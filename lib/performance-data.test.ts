import { beforeEach, describe, expect, it } from "vitest";
import { getHoldVsSoldData, type ResolvedTimeFrame } from "./performance-data";
import { createTrade } from "./db/trades";
import { resolveOrCreateSymbolMapping } from "./db/symbol-map";
import { closedTradePnl } from "./trade-stats";
import { __resetStoreForTests } from "./db/local-store";

const USER_ID = "praveen2013p@gmail.com";
const ALL_TIME: ResolvedTimeFrame = { preset: "all", fromDate: null, toDate: "2026-03-01" };

function closedTradeInput(overrides: Partial<Parameters<typeof createTrade>[1]> = {}) {
  return {
    market: "IN" as const,
    ticker: "MAPPEDCO",
    buy_date: "2026-01-01",
    quantity: 10,
    buy_price: 100,
    sell_date: "2026-02-01",
    sell_price: 120,
    strategy_tag_id: null,
    alert_id: null,
    stop_loss: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("getHoldVsSoldData", () => {
  it("computes totalActualPnl and totalHypotheticalHoldPnl over the SAME trade population - never a mismatched one", async () => {
    // A ticker with a resolved symbol mapping (price available) ...
    await resolveOrCreateSymbolMapping("IN", "MAPPEDCO", "NSE");
    const mapped = await createTrade(USER_ID, closedTradeInput({ ticker: "MAPPEDCO" }));
    // ... and a ticker with NO mapping at all, so its held-return can never
    // be resolved. Its ticker contains an underscore so resolveOrCreateSymbolMapping
    // would NOT auto-map it even if it were ever called - but we deliberately
    // never call it here, to simulate "no mapping row exists yet."
    const unmapped = await createTrade(
      USER_ID,
      closedTradeInput({ ticker: "UNMAPPED_CO", buy_price: 50, sell_price: 10_000 }), // huge P&L - would badly skew totalActualPnl if wrongly included
    );

    const data = await getHoldVsSoldData(USER_ID, "IN", ALL_TIME);

    expect(data.totalClosedTradeCount).toBe(2);
    expect(data.coveredTradeCount).toBe(1);

    const mappedRow = data.rows.find((r) => r.trade.id === mapped.id)!;
    const unmappedRow = data.rows.find((r) => r.trade.id === unmapped.id)!;
    expect(mappedRow.heldReturnPct).not.toBeNull();
    expect(unmappedRow.heldReturnPct).toBeNull();

    // totalActualPnl must equal exactly the mapped trade's own real P&L -
    // the unmapped trade's huge P&L must be fully excluded, matching it
    // being excluded from totalHypotheticalHoldPnl too (same population).
    const expectedActualPnl = closedTradePnl(mapped)!.pnlAbs;
    expect(data.totalActualPnl).toBeCloseTo(expectedActualPnl, 6);

    // Sanity: if the bug were present, totalActualPnl would include the
    // unmapped trade's pnlAbs too, which is ~99,500 - wildly different.
    const unmappedPnlAbs = closedTradePnl(unmapped)!.pnlAbs;
    expect(Math.abs(data.totalActualPnl - (expectedActualPnl + unmappedPnlAbs))).toBeGreaterThan(1000);
  });

  it("covers every closed trade when every ticker resolves to a mapped symbol", async () => {
    await resolveOrCreateSymbolMapping("IN", "MAPPEDCO", "NSE");
    await resolveOrCreateSymbolMapping("IN", "MAPPEDTWO", "NSE");
    await createTrade(USER_ID, closedTradeInput({ ticker: "MAPPEDCO" }));
    await createTrade(USER_ID, closedTradeInput({ ticker: "MAPPEDTWO" }));

    const data = await getHoldVsSoldData(USER_ID, "IN", ALL_TIME);

    expect(data.totalClosedTradeCount).toBe(2);
    expect(data.coveredTradeCount).toBe(2);
  });
});

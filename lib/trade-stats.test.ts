import { describe, expect, it } from "vitest";
import type { TradeRow } from "./db/schema-types";
import {
  closedTradePnl,
  computeStrategyResults,
  computeTradeStats,
  daysBetween,
  isTradeClosed,
  openTradePnl,
  rMultiple,
} from "./trade-stats";

function trade(overrides: Partial<TradeRow>): TradeRow {
  return {
    id: crypto.randomUUID(),
    user_id: "praveen2013p@gmail.com",
    market: "IN",
    ticker: "SBIN",
    buy_date: "2026-11-01",
    quantity: 10,
    buy_price: 100,
    sell_date: null,
    sell_price: null,
    strategy_tag_id: null,
    alert_id: null,
    stop_loss: null,
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("daysBetween", () => {
  it("counts whole days between two yyyy-mm-dd dates", () => {
    expect(daysBetween("2026-11-01", "2026-11-11")).toBe(10);
  });
  it("never goes negative", () => {
    expect(daysBetween("2026-11-11", "2026-11-01")).toBe(0);
  });
});

describe("isTradeClosed / closedTradePnl", () => {
  it("an open trade (no sell_date/sell_price) is not closed", () => {
    const t = trade({});
    expect(isTradeClosed(t)).toBe(false);
    expect(closedTradePnl(t)).toBeNull();
  });

  it("computes P&L abs/%% and holding days for a closed winning trade", () => {
    const t = trade({ sell_date: "2026-11-11", sell_price: 110 });
    expect(isTradeClosed(t)).toBe(true);
    const result = closedTradePnl(t)!;
    expect(result.pnlAbs).toBeCloseTo(100, 5); // (110-100)*10
    expect(result.pnlPct).toBeCloseTo(10, 5);
    expect(result.holdingDays).toBe(10);
  });

  it("computes P&L for a closed losing trade", () => {
    const t = trade({ buy_price: 200, sell_date: "2026-11-05", sell_price: 180, quantity: 5 });
    const result = closedTradePnl(t)!;
    expect(result.pnlAbs).toBeCloseTo(-100, 5); // (180-200)*5
    expect(result.pnlPct).toBeCloseTo(-10, 5);
  });

  it("includes the R-multiple when a stop-loss was set", () => {
    const t = trade({ buy_price: 100, stop_loss: 95, sell_date: "2026-11-05", sell_price: 110 });
    expect(closedTradePnl(t)!.rMultiple).toBeCloseTo(2, 5); // (110-100)/(100-95)
  });
});

describe("rMultiple", () => {
  it("is null when no stop-loss was set", () => {
    const t = trade({ buy_price: 100, stop_loss: null });
    expect(rMultiple(t, 110)).toBeNull();
  });

  it("is null when the stop isn't below the buy price (no defined risk)", () => {
    const t = trade({ buy_price: 100, stop_loss: 100 });
    expect(rMultiple(t, 110)).toBeNull();
  });

  it("is negative for a loss smaller than the risk taken", () => {
    const t = trade({ buy_price: 100, stop_loss: 90 });
    expect(rMultiple(t, 95)).toBeCloseTo(-0.5, 5); // (95-100)/(100-90)
  });
});

describe("openTradePnl", () => {
  it("returns nulls for P&L when no live price is known, but still reports holding days", () => {
    const t = trade({ buy_date: "2026-11-01" });
    const result = openTradePnl(t, null, "2026-11-08");
    expect(result.pnlAbs).toBeNull();
    expect(result.pnlPct).toBeNull();
    expect(result.holdingDays).toBe(7);
  });

  it("computes unrealised P&L from a live price", () => {
    const t = trade({ buy_price: 100, quantity: 10 });
    const result = openTradePnl(t, 120, "2026-11-08");
    expect(result.pnlAbs).toBeCloseTo(200, 5);
    expect(result.pnlPct).toBeCloseTo(20, 5);
  });
});

describe("computeTradeStats", () => {
  it("returns an empty/null summary when there are no closed trades", () => {
    const stats = computeTradeStats([]);
    expect(stats.tradeCount).toBe(0);
    expect(stats.winRate).toBeNull();
    expect(stats.profitFactor).toBeNull();
    expect(stats.realizedPnl).toBe(0);
  });

  it("matches hand-computed win rate, avg gain/loss, expectancy, profit factor", () => {
    // 3 wins (+10%, +20%, +30%), 2 losses (-10%, -5%), all qty 1, buy 100.
    const trades = [
      trade({ buy_price: 100, quantity: 1, sell_date: "2026-11-02", sell_price: 110 }),
      trade({ buy_price: 100, quantity: 1, sell_date: "2026-11-03", sell_price: 120 }),
      trade({ buy_price: 100, quantity: 1, sell_date: "2026-11-04", sell_price: 130 }),
      trade({ buy_price: 100, quantity: 1, sell_date: "2026-11-05", sell_price: 90 }),
      trade({ buy_price: 100, quantity: 1, sell_date: "2026-11-06", sell_price: 95 }),
    ].map((t) => closedTradePnl(t)!);

    const stats = computeTradeStats(trades);
    expect(stats.tradeCount).toBe(5);
    expect(stats.winRate).toBeCloseTo(60, 5); // 3/5
    expect(stats.avgGainPct).toBeCloseTo(20, 5); // (10+20+30)/3
    expect(stats.avgLossPct).toBeCloseTo(-7.5, 5); // (-10-5)/2
    // expectancy = 0.6*20 - 0.4*7.5 = 12 - 3 = 9
    expect(stats.expectancyPct).toBeCloseTo(9, 5);
    expect(stats.realizedPnl).toBeCloseTo(10 + 20 + 30 - 10 - 5, 5); // = 45
    // gross win = 60, gross loss = 15 -> profit factor 4
    expect(stats.profitFactor).toBeCloseTo(4, 5);
    expect(stats.bestTradePct).toBeCloseTo(30, 5);
    expect(stats.worstTradePct).toBeCloseTo(-10, 5);
  });

  it("profit factor is null (undefined ratio) when there are no losing trades yet", () => {
    const trades = [trade({ sell_date: "2026-11-02", sell_price: 110 })].map((t) => closedTradePnl(t)!);
    expect(computeTradeStats(trades).profitFactor).toBeNull();
  });

  it("builds an equity curve ordered by sell date and finds the max drawdown", () => {
    // +100, then -150 (new trough), then +50 -> peak 100, trough -50, drawdown 150.
    const closed = [
      { trade: trade({ sell_date: "2026-11-01" }), pnlAbs: 100, pnlPct: 10, holdingDays: 1, rMultiple: null },
      { trade: trade({ sell_date: "2026-11-02" }), pnlAbs: -150, pnlPct: -15, holdingDays: 1, rMultiple: null },
      { trade: trade({ sell_date: "2026-11-03" }), pnlAbs: 50, pnlPct: 5, holdingDays: 1, rMultiple: null },
    ];
    const stats = computeTradeStats(closed);
    expect(stats.equityCurve.map((p) => p.cumulativePnl)).toEqual([100, -50, 0]);
    expect(stats.maxDrawdown).toBeCloseTo(150, 5); // peak 100 -> trough -50
  });

  it("averages R-multiple only across trades that have one", () => {
    const trades = [
      trade({ buy_price: 100, stop_loss: 90, sell_date: "2026-11-02", sell_price: 120 }), // R = 2
      trade({ buy_price: 100, stop_loss: 90, sell_date: "2026-11-03", sell_price: 80 }), // R = -2
      trade({ buy_price: 100, stop_loss: null, sell_date: "2026-11-04", sell_price: 110 }), // no stop - excluded
    ].map((t) => closedTradePnl(t)!);

    expect(computeTradeStats(trades).avgRMultiple).toBeCloseTo(0, 5); // (2 + -2) / 2
  });

  it("avgRMultiple is null when no closed trade has a stop-loss", () => {
    const trades = [trade({ sell_date: "2026-11-02", sell_price: 110 })].map((t) => closedTradePnl(t)!);
    expect(computeTradeStats(trades).avgRMultiple).toBeNull();
  });
});

describe("computeStrategyResults", () => {
  it("groups closed trades by strategy tag and computes per-tag stats", () => {
    const tagNames = new Map([["tag-a", "Stage 2 breakout"]]);
    const trades = [
      closedTradePnl(
        trade({ strategy_tag_id: "tag-a", buy_price: 100, quantity: 1, sell_date: "2026-11-02", sell_price: 120 }),
      )!,
      closedTradePnl(
        trade({ strategy_tag_id: "tag-a", buy_price: 100, quantity: 1, sell_date: "2026-11-03", sell_price: 80 }),
      )!,
      closedTradePnl(
        trade({ strategy_tag_id: null, buy_price: 100, quantity: 1, sell_date: "2026-11-04", sell_price: 110 }),
      )!,
    ];
    const results = computeStrategyResults(trades, tagNames);
    expect(results).toHaveLength(2);

    const tagged = results.find((r) => r.tagId === "tag-a")!;
    expect(tagged.tagName).toBe("Stage 2 breakout");
    expect(tagged.tradeCount).toBe(2);
    expect(tagged.winRate).toBeCloseTo(50, 5);
    expect(tagged.totalPnl).toBeCloseTo(0, 5); // +20 - 20

    const untagged = results.find((r) => r.tagId === null)!;
    expect(untagged.tagName).toBe("Untagged");
    expect(untagged.totalPnl).toBeCloseTo(10, 5);
  });

  it("labels an unknown tag id (deleted tag) instead of crashing", () => {
    const trades = [
      closedTradePnl(
        trade({ strategy_tag_id: "ghost-tag", sell_date: "2026-11-02", sell_price: 110 }),
      )!,
    ];
    const results = computeStrategyResults(trades, new Map());
    expect(results[0].tagName).toBe("Unknown tag");
  });
});

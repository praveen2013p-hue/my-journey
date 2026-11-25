import { describe, expect, it } from "vitest";
import { computeGradeCalibration, computeQualityScoreCalibration } from "./quality-calibration";
import type { AlertRow } from "./db/schema-types";
import type { ClosedTradeResult } from "./trade-stats";

function alert(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    id: crypto.randomUUID(),
    market: "IN",
    exchange: "NSE",
    ticker: "SBIN",
    signal_type: "breakout",
    grade: "A",
    week_ending: "2026-11-20",
    triggered_at: "2026-11-20T15:45:00+05:30",
    trigger_price: 100,
    open: null,
    high: null,
    low: null,
    volume: null,
    breakout_level: null,
    vol_ratio: null,
    mrs: null,
    pct_above_ma: null,
    overhead_pct: null,
    sector: null,
    industry: null,
    fundamentals: null,
    ma30w: null,
    quality_score: 80,
    quality_breakdown: null,
    adjustment_factor: 1,
    needs_adjustment_review: false,
    raw: {},
    created_at: "2026-11-20T15:45:00+05:30",
    updated_at: "2026-11-20T15:45:00+05:30",
    ...overrides,
  };
}

function closed(alertId: string | null, pnlPct: number, rMultiple: number | null = null): ClosedTradeResult {
  return {
    trade: {
      id: crypto.randomUUID(),
      user_id: "u",
      market: "IN",
      ticker: "SBIN",
      buy_date: "2026-11-20",
      quantity: 1,
      buy_price: 100,
      sell_date: "2026-11-21",
      sell_price: 100 * (1 + pnlPct / 100),
      strategy_tag_id: null,
      alert_id: alertId,
      stop_loss: null,
      created_at: "2026-11-20T00:00:00.000Z",
    },
    pnlAbs: pnlPct,
    pnlPct,
    holdingDays: 1,
    rMultiple,
  };
}

describe("computeGradeCalibration", () => {
  it("groups closed trades by their alert's grade and computes win rate", () => {
    const gradeA = alert({ grade: "A" });
    const gradeC = alert({ grade: "C" });
    const alertById = new Map([
      [gradeA.id, gradeA],
      [gradeC.id, gradeC],
    ]);
    const trades = [closed(gradeA.id, 10), closed(gradeA.id, -5), closed(gradeC.id, -20)];

    const rows = computeGradeCalibration(trades, alertById);
    const a = rows.find((r) => r.grade === "A")!;
    const c = rows.find((r) => r.grade === "C")!;
    expect(a.tradeCount).toBe(2);
    expect(a.winRate).toBeCloseTo(50, 5);
    expect(c.tradeCount).toBe(1);
    expect(c.winRate).toBe(0);
  });

  it("leaves out trades with no alert_id, or whose alert isn't in the map", () => {
    const rows = computeGradeCalibration([closed(null, 10), closed("missing-id", 10)], new Map());
    expect(rows).toEqual([]);
  });

  it("only averages R-multiple across trades that have one", () => {
    const a = alert({ grade: "A" });
    const alertById = new Map([[a.id, a]]);
    const trades = [closed(a.id, 10, 2), closed(a.id, 5, null)];
    const rows = computeGradeCalibration(trades, alertById);
    expect(rows[0].avgRMultiple).toBe(2);
  });
});

describe("computeQualityScoreCalibration", () => {
  it("buckets by quality_score and skips empty buckets", () => {
    const low = alert({ quality_score: 20 });
    const high = alert({ quality_score: 90 });
    const alertById = new Map([
      [low.id, low],
      [high.id, high],
    ]);
    const rows = computeQualityScoreCalibration([closed(low.id, -10), closed(high.id, 15)], alertById);

    expect(rows.map((r) => r.label)).toEqual(["0-39", "80-100"]);
    expect(rows.find((r) => r.label === "0-39")!.winRate).toBe(0);
    expect(rows.find((r) => r.label === "80-100")!.winRate).toBe(100);
  });

  it("leaves out an alert with no quality_score", () => {
    const a = alert({ quality_score: null });
    const rows = computeQualityScoreCalibration([closed(a.id, 10)], new Map([[a.id, a]]));
    expect(rows).toEqual([]);
  });
});

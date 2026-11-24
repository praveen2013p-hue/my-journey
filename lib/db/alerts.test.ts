import { beforeEach, describe, expect, it } from "vitest";
import { getLatestWeekEnding, listAlerts, upsertAlert } from "./alerts";
import { replaceConstituents } from "./sector-constituents";
import { __resetStoreForTests } from "./local-store";
import { upsertSectorMetric, upsertSectorSnapshot } from "./sectors";

function sampleInput(overrides: Partial<Parameters<typeof upsertAlert>[0]> = {}) {
  return {
    market: "IN" as const,
    exchange: "NSE",
    ticker: "SBIN",
    signal_type: "breakout" as const,
    grade: "A" as const,
    week_ending: "2026-11-20",
    triggered_at: "2026-11-20T15:45:00+05:30",
    trigger_price: 812.5,
    open: 790.1,
    high: 818.9,
    low: 788.0,
    volume: 54231000,
    breakout_level: 801.4,
    vol_ratio: 2.31,
    mrs: 4.7,
    pct_above_ma: 9.8,
    overhead_pct: 0,
    sector: "Finance",
    industry: "Regional Banks",
    fundamentals: null,
    raw: { secret: "redacted" },
    ...overrides,
  };
}

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("upsertAlert", () => {
  it("inserts a new row the first time a key is seen", async () => {
    const { row, wasUpdate } = await upsertAlert(sampleInput());
    expect(wasUpdate).toBe(false);
    expect(row.ticker).toBe("SBIN");
    expect(row.quality_score).toBeGreaterThan(0);
  });

  it("the same (market, ticker, signal_type, week_ending) updates in place instead of duplicating", async () => {
    const first = await upsertAlert(sampleInput({ trigger_price: 812.5 }));
    const second = await upsertAlert(sampleInput({ trigger_price: 820.0 }));

    expect(second.wasUpdate).toBe(true);
    expect(second.row.id).toBe(first.row.id);
    expect(second.row.trigger_price).toBe(820.0);

    const all = await listAlerts();
    expect(all.filter((a) => a.ticker === "SBIN")).toHaveLength(1);
  });

  it("a different week_ending for the same ticker creates a second row", async () => {
    await upsertAlert(sampleInput({ week_ending: "2026-11-20" }));
    await upsertAlert(sampleInput({ week_ending: "2026-11-27" }));
    const all = await listAlerts();
    expect(all).toHaveLength(2);
  });

  it("a different signal_type for the same ticker/week creates a second row (breakout vs pullback)", async () => {
    await upsertAlert(sampleInput({ signal_type: "breakout" }));
    await upsertAlert(sampleInput({ signal_type: "pullback" }));
    const all = await listAlerts();
    expect(all).toHaveLength(2);
  });
});

describe("listAlerts filters", () => {
  beforeEach(async () => {
    await upsertAlert(sampleInput({ ticker: "SBIN", market: "IN", grade: "A", week_ending: "2026-11-20" }));
    await upsertAlert(sampleInput({ ticker: "AXISBANK", market: "IN", grade: "B", week_ending: "2026-11-20" }));
    await upsertAlert(sampleInput({ ticker: "AAPL", market: "US", grade: "A", week_ending: "2026-11-20", exchange: "NASDAQ" }));
  });

  it("filters by market", async () => {
    const rows = await listAlerts({ market: "US" });
    expect(rows.map((r) => r.ticker)).toEqual(["AAPL"]);
  });

  it("filters by grade", async () => {
    const rows = await listAlerts({ grades: ["A"] });
    expect(rows.map((r) => r.ticker).sort()).toEqual(["AAPL", "SBIN"]);
  });

  it("filters by ticker search, case-insensitive", async () => {
    const rows = await listAlerts({ search: "sbin" });
    expect(rows.map((r) => r.ticker)).toEqual(["SBIN"]);
  });

  it("getLatestWeekEnding finds the most recent week with alerts", async () => {
    await upsertAlert(sampleInput({ ticker: "TANLA", week_ending: "2026-11-27" }));
    expect(await getLatestWeekEnding()).toBe("2026-11-27");
  });
});

describe("upsertAlert sector strength (Quality Score)", () => {
  it("scores sector strength as 0/missing with no constituents uploaded", async () => {
    const { row } = await upsertAlert(sampleInput({ ticker: "SBIN" }));
    expect((row.quality_breakdown as { sector: number }).sector).toBe(0);
  });

  it("awards full sector points once constituents + a focus-starred sector_metrics row exist", async () => {
    await replaceConstituents("IN", "PSU Bank", ["SBIN"]);
    await upsertSectorSnapshot({
      market: "IN",
      week_ending: "2026-11-20",
      sector: "PSU Bank",
      stage: 2,
      mrs: 12.4,
      rs_up: true,
      vs_ma: 15,
      chg4: 6,
      focus: true,
      source: "alert",
    });
    await upsertSectorMetric({
      market: "IN",
      week_ending: "2026-11-20",
      sector: "PSU Bank",
      rank: 1,
      mrs: 12.4,
      d4: 3,
      d13: 2,
      d26: null,
      d52: null,
      traded_value: null,
      tv_avg10: null,
      tv_ratio: null,
      is_focus: true,
      price_chg_1w: null,
      rs_chg_1w: null,
      traded_value_chg_1w: null,
      rank_move_1w: null,
    });

    const { row } = await upsertAlert(sampleInput({ ticker: "SBIN", week_ending: "2026-11-20" }));
    expect((row.quality_breakdown as { sector: number }).sector).toBe(15); // QUALITY_WEIGHTS.sector.focus
  });
});

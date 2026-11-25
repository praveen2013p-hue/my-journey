import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __clearRegimeCacheForTests } from "./regime";
import { computeRiskScore, getRiskScore } from "./risk-score";
import { __resetStoreForTests } from "./db/local-store";
import { seedSectorMapIfEmpty } from "./db/sector-map";
import { upsertSectorMetric, upsertSectorSnapshot } from "./db/sectors";
import { SECTOR_MAP_SEED } from "./sector-map-seed";

describe("computeRiskScore", () => {
  it("averages every available component", () => {
    const { score, label } = computeRiskScore({ regimeStage: 2, breadthPct: 80, avgRsChg1w: 2 });
    // regime=90, breadth=80, momentum=50+2*5=60 -> avg = 76.67 -> 77
    expect(score).toBe(77);
    expect(label).toBe("risk-on");
  });

  it("returns null when nothing is known", () => {
    expect(computeRiskScore({ regimeStage: null, breadthPct: null, avgRsChg1w: null })).toEqual({
      score: null,
      label: null,
    });
  });

  it("still scores from whichever single component is available", () => {
    const { score, label } = computeRiskScore({ regimeStage: null, breadthPct: 10, avgRsChg1w: null });
    expect(score).toBe(10);
    expect(label).toBe("risk-off");
  });

  it("labels a middling score as neutral", () => {
    const { label } = computeRiskScore({ regimeStage: null, breadthPct: 50, avgRsChg1w: null });
    expect(label).toBe("neutral");
  });
});

describe("getRiskScore", () => {
  beforeEach(async () => {
    await __resetStoreForTests();
    process.env.FORCE_MOCK_US = "true";
    __clearRegimeCacheForTests();
  });

  afterEach(() => {
    delete process.env.FORCE_MOCK_US;
  });

  it("returns an unavailable result when there's no sector snapshot yet", async () => {
    const result = await getRiskScore("US");
    expect(result.weekEnding).toBeNull();
    expect(result.score).toBeNull();
  });

  it("combines breadth and momentum from this week's sector data with the benchmark regime", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    const weekEnding = "2026-11-20";

    await upsertSectorSnapshot({
      market: "US",
      week_ending: weekEnding,
      sector: "Technology",
      stage: 2,
      mrs: 10,
      rs_up: true,
      vs_ma: 5,
      chg4: 2,
      focus: true,
      source: "alert",
    });
    await upsertSectorSnapshot({
      market: "US",
      week_ending: weekEnding,
      sector: "Energy",
      stage: 4,
      mrs: -5,
      rs_up: false,
      vs_ma: -5,
      chg4: -2,
      focus: false,
      source: "alert",
    });
    await upsertSectorMetric({
      market: "US",
      week_ending: weekEnding,
      sector: "Technology",
      rank: 1,
      mrs: 10,
      price_chg_1w: 1,
      rs_chg_1w: 3,
      traded_value_chg_1w: null,
      rank_move_1w: null,
      d4: null,
      d13: null,
      d26: null,
      d52: null,
      traded_value: null,
      tv_avg10: null,
      tv_ratio: null,
      is_focus: true,
    });
    await upsertSectorMetric({
      market: "US",
      week_ending: weekEnding,
      sector: "Energy",
      rank: 2,
      mrs: -5,
      price_chg_1w: -1,
      rs_chg_1w: -1,
      traded_value_chg_1w: null,
      rank_move_1w: null,
      d4: null,
      d13: null,
      d26: null,
      d52: null,
      traded_value: null,
      tv_avg10: null,
      tv_ratio: null,
      is_focus: false,
    });

    const result = await getRiskScore("US");
    expect(result.weekEnding).toBe(weekEnding);
    expect(result.breadthPct).toBe(50); // 1 of 2 sectors in Stage 2
    expect(result.avgRsChg1w).toBe(1); // (3 + -1) / 2
    expect(result.score).not.toBeNull();
  });
});

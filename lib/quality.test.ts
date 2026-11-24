import { describe, expect, it } from "vitest";
import { computeQualityScore, type QualityInputs } from "./quality";

const fullInputs = (): QualityInputs => ({
  grade: "A",
  volRatio: 2.1,
  mrs: 12,
  overheadPct: 3,
  sectors: [{ isFocus: true, stage: 2, mrs: 10 }],
  fundamentals: {
    salesGrowthYoY: 25,
    epsGrowthYoY: 22,
    roe: 18,
    debtToEquity: 0.8,
  },
});

describe("computeQualityScore", () => {
  it("adds every criterion when all inputs are present", () => {
    // grade 30 + volume (2.1/3*15=10.5) + rs (12/20*15=9) + room (<=5% -> 10)
    // + sector (focus -> 15) + fundamentals (all four hit -> 15) = 89.5 -> 90
    const result = computeQualityScore(fullInputs());
    expect(result.score).toBe(90);
    expect(result.partial).toBe(false);
    expect(result.breakdown.grade).toBe(30);
    expect(result.breakdown.volume).toBeCloseTo(10.5, 5);
    expect(result.breakdown.rs).toBeCloseTo(9, 5);
    expect(result.breakdown.room).toBe(10);
    expect(result.breakdown.sector).toBe(15);
    expect(result.breakdown.fundamentals).toBe(15);
  });

  it("falls back to 0 per missing criterion and marks the score partial", () => {
    const result = computeQualityScore({
      grade: "B",
      volRatio: null,
      mrs: null,
      overheadPct: null,
      sectors: [],
      fundamentals: null,
    });
    expect(result.score).toBe(20); // grade only
    expect(result.partial).toBe(true);
    expect(result.breakdown).toEqual({
      grade: 20,
      volume: 0,
      rs: 0,
      room: 0,
      sector: 0,
      fundamentals: 0,
    });
  });

  it("caps volume ratio credit at 3x and RS credit at 20", () => {
    const result = computeQualityScore({
      ...fullInputs(),
      volRatio: 10, // way above the 3x cap
      mrs: 500, // way above the 20 cap
    });
    expect(result.breakdown.volume).toBe(15);
    expect(result.breakdown.rs).toBe(15);
  });

  it("gives zero room credit at or above 15% overhead, full credit at or below 5%, linear between", () => {
    expect(computeQualityScore({ ...fullInputs(), overheadPct: 5 }).breakdown.room).toBe(10);
    expect(computeQualityScore({ ...fullInputs(), overheadPct: 15 }).breakdown.room).toBe(0);
    expect(computeQualityScore({ ...fullInputs(), overheadPct: 10 }).breakdown.room).toBe(5);
  });

  it("sector score takes the best of several constituent sectors", () => {
    const result = computeQualityScore({
      ...fullInputs(),
      sectors: [
        { isFocus: false, stage: 2, mrs: -1 }, // stage 2 but RS <= 0 -> 5
        { isFocus: false, stage: 2, mrs: 3 }, // stage 2 and RS > 0 -> 10
      ],
    });
    expect(result.breakdown.sector).toBe(10);
  });

  it("fundamentals thresholds are strict (>, not >=) and each missing field is independent", () => {
    const atBoundary = computeQualityScore({
      ...fullInputs(),
      fundamentals: {
        salesGrowthYoY: 20, // not > 20
        epsGrowthYoY: null, // missing
        roe: 15, // not > 15
        debtToEquity: 1, // not < 1
      },
    });
    expect(atBoundary.breakdown.fundamentals).toBe(0);
    expect(atBoundary.partial).toBe(true);
  });
});

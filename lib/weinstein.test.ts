import { describe, expect, it } from "vitest";
import { approxMa30w, mansfieldRS, sma, weinsteinStage } from "./weinstein";

describe("sma", () => {
  it("is null until there are `period` values, then averages the window", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe("weinsteinStage", () => {
  it("returns stage null with fewer than 30 bars", () => {
    const closes = Array.from({ length: 29 }, (_, i) => 100 + i);
    expect(weinsteinStage(closes).stage).toBeNull();
  });

  it("stage 2: 30W MA rising and close at/above it", () => {
    // 40 weeks, close rising 2/week -> MA rising, latest close above MA.
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
    const result = weinsteinStage(closes);
    expect(result.rising).toBe(true);
    expect(result.falling).toBe(false);
    expect(result.ma).toBeCloseTo(149, 5);
    expect(result.maSlopePct).toBeCloseTo(5.6737588652, 5);
    expect(result.stage).toBe(2);
  });

  it("stage 4: 30W MA falling and close at/below it", () => {
    // 40 weeks, close falling 2/week -> MA falling, latest close below MA.
    const closes = Array.from({ length: 40 }, (_, i) => 300 - i * 2);
    const result = weinsteinStage(closes);
    expect(result.rising).toBe(false);
    expect(result.falling).toBe(true);
    expect(result.ma).toBeCloseTo(251, 5);
    expect(result.stage).toBe(4);
  });

  it("stage 1: MA still falling but this week's close spiked above it", () => {
    // Same falling series, but the latest bar jumps well above the MA
    // without being large enough to flip the MA's own slope to rising.
    const closes = Array.from({ length: 40 }, (_, i) => 300 - i * 2);
    closes[closes.length - 1] = 260;
    const result = weinsteinStage(closes);
    expect(result.falling).toBe(true);
    expect(result.rising).toBe(false);
    expect(result.ma).toBeCloseTo(252.2666666667, 5);
    expect(closes[closes.length - 1]).toBeGreaterThan(result.ma as number);
    expect(result.stage).toBe(1);
  });

  it("stage 3: MA flat (neither rising nor falling) but above its value 26 weeks ago", () => {
    // 56 flat weeks then a tiny 4-week uptick: slope stays inside
    // [-0.5%, 0.5%], so the sideways tie-break (ma vs ma 26 weeks back) runs.
    const closes = [
      ...Array.from({ length: 56 }, () => 100),
      ...Array.from({ length: 4 }, (_, i) => 100 + i * 0.05),
    ];
    const result = weinsteinStage(closes);
    expect(result.rising).toBe(false);
    expect(result.falling).toBe(false);
    expect(result.maSlopePct).toBeCloseTo(0.01, 2);
    expect(result.stage).toBe(3);
  });
});

describe("mansfieldRS", () => {
  it("is null when there is no overlapping history", () => {
    expect(mansfieldRS([], []).mrs).toBeNull();
  });

  it("delta is null for horizons with insufficient history, not a crash", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 * 1.01 ** i);
    const bench = Array.from({ length: 60 }, (_, i) => 100 * 1.002 ** i);
    const { delta } = mansfieldRS(closes, bench);
    expect(delta.d4).not.toBeNull();
    expect(delta.d13).toBeNull();
    expect(delta.d26).toBeNull();
    expect(delta.d52).toBeNull();
  });

  it("mrs rises and all four deltas are positive when RS has been accelerating", () => {
    // Benchmark held flat at 1 so `rs` tracks `closes` directly: flat for 60
    // weeks, then accelerating 2%/week for the next 44 (104 weeks total) -
    // a stock whose relative strength just started pulling away.
    const flatWeeks = Array.from({ length: 60 }, () => 100);
    const acceleratingWeeks = Array.from(
      { length: 44 },
      (_, i) => 100 * 1.02 ** (i + 1),
    );
    const closes = [...flatWeeks, ...acceleratingWeeks];
    const bench = closes.map(() => 1);

    const { rs, mrs, delta } = mansfieldRS(closes, bench);
    expect(rs).toBeCloseTo(239.0053142452, 5);
    expect(mrs).toBeCloseTo(57.5339001410, 5);
    expect(delta.d4).toBeCloseTo(1.5523393816, 5);
    expect(delta.d13).toBeCloseTo(7.9479407535, 5);
    expect(delta.d26).toBeCloseTo(24.5323566377, 5);
    expect(delta.d52).toBeCloseTo(57.5339001410, 5);
    expect(delta.d4).toBeGreaterThan(0);
    expect(delta.d13).toBeGreaterThan(0);
    expect(delta.d26).toBeGreaterThan(0);
    expect(delta.d52).toBeGreaterThan(0);
  });
});

describe("approxMa30w", () => {
  it("backs out the MA from trigger price and % above MA", () => {
    // price is 10% above the MA -> MA = price / 1.10
    expect(approxMa30w(110, 10)).toBeCloseTo(100, 5);
  });

  it("returns null when pctAboveMA is missing", () => {
    expect(approxMa30w(110, null)).toBeNull();
  });
});

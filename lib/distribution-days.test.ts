import { describe, expect, it } from "vitest";
import { countDistributionDays } from "./distribution-days";
import type { DailyBar } from "./providers/types";

function bar(date: string, close: number, volume: number | null): DailyBar {
  return { date, close, volume };
}

describe("countDistributionDays", () => {
  it("counts a day closing down >=0.2% on higher volume than the prior day", () => {
    const bars: DailyBar[] = [
      bar("2026-11-01", 100, 1_000_000),
      bar("2026-11-02", 99.5, 1_500_000), // -0.5%, higher volume -> distribution day
      bar("2026-11-03", 99.8, 1_200_000), // up, not counted
      bar("2026-11-04", 99.0, 900_000), // down but lower volume -> not counted
    ];
    expect(countDistributionDays(bars, 10)).toBe(1);
  });

  it("doesn't count a down day that's below the 0.2% threshold", () => {
    const bars: DailyBar[] = [bar("2026-11-01", 100, 1_000_000), bar("2026-11-02", 99.9, 2_000_000)]; // -0.1%
    expect(countDistributionDays(bars, 10)).toBe(0);
  });

  it("returns null when any bar in the window is missing volume, never a guessed count", () => {
    const bars: DailyBar[] = [bar("2026-11-01", 100, null), bar("2026-11-02", 99, 1_000_000)];
    expect(countDistributionDays(bars, 10)).toBeNull();
  });

  it("returns null with fewer than two bars", () => {
    expect(countDistributionDays([bar("2026-11-01", 100, 1_000_000)], 10)).toBeNull();
  });

  it("only looks at the trailing window, ignoring older bars", () => {
    const bars: DailyBar[] = [
      bar("2026-10-01", 100, 1_000_000),
      bar("2026-10-02", 90, 5_000_000), // a big distribution day, but outside a window of 1
      bar("2026-11-01", 100, 1_000_000),
      bar("2026-11-02", 99.9, 900_000), // tiny down move, lower volume - not counted
    ];
    expect(countDistributionDays(bars, 1)).toBe(0);
  });
});

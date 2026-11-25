import { describe, expect, it } from "vitest";
import { classifyVsSectorRs, computeRsRatingPercentiles, sectorMedianMrs } from "./rs-rating";

describe("computeRsRatingPercentiles", () => {
  it("ranks the highest RS near 99 and the lowest near 1", () => {
    const result = computeRsRatingPercentiles(
      new Map([
        ["A", -10],
        ["B", 0],
        ["C", 5],
        ["D", 20],
      ]),
    );
    expect(result.get("D")).toBe(99);
    expect(result.get("A")).toBe(25);
    expect(result.get("B")).toBe(50);
    expect(result.get("C")).toBe(75);
  });

  it("clamps to 1-99 even for a single ticker", () => {
    const result = computeRsRatingPercentiles(new Map([["ONLY", 7]]));
    expect(result.get("ONLY")).toBe(99);
  });

  it("returns an empty map for an empty input", () => {
    expect(computeRsRatingPercentiles(new Map())).toEqual(new Map());
  });
});

describe("classifyVsSectorRs", () => {
  it("is a leader when meaningfully above the sector median", () => {
    expect(classifyVsSectorRs(10, 2)).toBe("leader");
  });

  it("is a laggard when meaningfully below the sector median", () => {
    expect(classifyVsSectorRs(-3, 5)).toBe("laggard");
  });

  it("is inline within the tolerance band", () => {
    expect(classifyVsSectorRs(5.2, 5, 0.5)).toBe("inline");
  });
});

describe("sectorMedianMrs", () => {
  it("returns the middle value for an odd-length list", () => {
    expect(sectorMedianMrs([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values for an even-length list", () => {
    expect(sectorMedianMrs([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns null for an empty list, never a guessed 0", () => {
    expect(sectorMedianMrs([])).toBeNull();
  });
});

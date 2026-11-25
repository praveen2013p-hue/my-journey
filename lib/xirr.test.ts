import { describe, expect, it } from "vitest";
import { computeXirr, daysSinceEpoch } from "./xirr";

describe("daysSinceEpoch", () => {
  it("counts a leap year correctly (2020 has 366 days)", () => {
    expect(daysSinceEpoch("2021-01-01") - daysSinceEpoch("2020-01-01")).toBe(366);
  });

  it("counts a non-leap year correctly", () => {
    expect(daysSinceEpoch("2022-01-01") - daysSinceEpoch("2021-01-01")).toBe(365);
  });
});

describe("computeXirr", () => {
  it("solves exactly 10% for a single contribution growing to 1.1x over exactly one year", () => {
    const flows = [
      { days: 0, amount: -10000 },
      { days: 365, amount: 11000 },
    ];
    expect(computeXirr(flows)! * 100).toBeCloseTo(10, 3);
  });

  it("solves exactly 0% when the value is unchanged after a year", () => {
    const flows = [
      { days: 0, amount: -10000 },
      { days: 365, amount: 10000 },
    ];
    expect(computeXirr(flows)! * 100).toBeCloseTo(0, 3);
  });

  it("matches an independently hand-solved rate for two contributions plus a terminal value", () => {
    // -10000 - 10000/(1+r) + 22000/(1+r)^2 = 0, solved by hand via the
    // quadratic formula (x = 1/(1+r)): x = (5 + sqrt(245)) / 22, so
    // r = 1/x - 1 - computed independently of the code under test.
    const x = (5 + Math.sqrt(245)) / 22;
    const expectedRate = 1 / x - 1;
    const flows = [
      { days: 0, amount: -10000 },
      { days: 365, amount: -10000 },
      { days: 730, amount: 22000 },
    ];
    expect(computeXirr(flows)!).toBeCloseTo(expectedRate, 5);
  });

  it("is null with fewer than two flows", () => {
    expect(computeXirr([{ days: 0, amount: -10000 }])).toBeNull();
  });

  it("is null when every flow falls on the same day, even if amounts net to zero - no time has passed to annualize over", () => {
    const flows = [
      { days: 100, amount: -10000 },
      { days: 100, amount: 10000 },
    ];
    expect(computeXirr(flows)).toBeNull();
  });

  it("is null when every flow is the same sign - nothing to solve for", () => {
    const flows = [
      { days: 0, amount: -10000 },
      { days: 30, amount: -5000 },
    ];
    expect(computeXirr(flows)).toBeNull();
  });

  it("handles a loss (negative XIRR)", () => {
    const flows = [
      { days: 0, amount: -10000 },
      { days: 365, amount: 9000 },
    ];
    const rate = computeXirr(flows)!;
    expect(rate).toBeLessThan(0);
    expect(rate * 100).toBeCloseTo(-10, 3); // 9000 = 10000*(1+r) -> r = -0.10 exactly
  });
});

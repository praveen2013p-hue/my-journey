import { describe, expect, it } from "vitest";
import { monthLabel, shiftMonth } from "./month-utils";

describe("shiftMonth", () => {
  it("shifts forward within the same year", () => {
    expect(shiftMonth("2026-03-01", 2)).toBe("2026-05-01");
  });

  it("shifts backward across a year boundary", () => {
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("shifts back 12 months to the same month a year earlier", () => {
    expect(shiftMonth("2026-06-01", -12)).toBe("2025-06-01");
  });
});

describe("monthLabel", () => {
  it("formats a month string as a short month name and year", () => {
    expect(monthLabel("2026-03-01")).toBe("Mar 2026");
    expect(monthLabel("2019-12-01")).toBe("Dec 2019");
  });
});

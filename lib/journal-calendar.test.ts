import { describe, expect, it } from "vitest";
import { buildCalendarMonth, shiftMonth, type CalendarTrade } from "./journal-calendar";

function trade(overrides: Partial<CalendarTrade>): CalendarTrade {
  return { id: "t1", ticker: "SBIN", exchange: "NSE", sellDate: "2026-11-05", pnlAbs: 100, ...overrides };
}

describe("buildCalendarMonth", () => {
  it("builds a Monday-first grid that fully covers the month, with correct leading/trailing padding", () => {
    // Nov 1 2026 is a Sunday, Nov 30 2026 is a Monday - independently
    // verified (not re-derived from the function under test), so the grid
    // must start Mon Oct 26 and end Sun Dec 6 (6 full weeks).
    const cal = buildCalendarMonth([], "2026-11");
    expect(cal.weeks).toHaveLength(6);
    expect(cal.weeks[0][0].date).toBe("2026-10-26");
    expect(cal.weeks[0][0].inMonth).toBe(false);
    expect(cal.weeks.at(-1)!.at(-1)!.date).toBe("2026-12-06");
    expect(cal.weeks.at(-1)!.at(-1)!.inMonth).toBe(false);

    const firstInMonthDay = cal.weeks[0].find((d) => d.inMonth);
    expect(firstInMonthDay?.date).toBe("2026-11-01");
    const lastWeekInMonthDays = cal.weeks.at(-1)!.filter((d) => d.inMonth);
    expect(lastWeekInMonthDays.at(-1)?.date).toBe("2026-11-30");
  });

  it("handles a leap-year February correctly (Feb 2028 has 29 days)", () => {
    // Independently verified: Feb 1 2028 and Feb 29 2028 are both Tuesdays.
    const cal = buildCalendarMonth([], "2028-02");
    expect(cal.weeks).toHaveLength(5);
    expect(cal.weeks[0][0].date).toBe("2028-01-31");
    const inMonthDays = cal.weeks.at(-1)!.filter((d) => d.inMonth);
    expect(inMonthDays.at(-1)?.date).toBe("2028-02-29");
    expect(cal.weeks.at(-1)!.at(-1)!.date).toBe("2028-03-05");
  });

  it("sums multiple trades closed on the same day without losing or duplicating any", () => {
    const cal = buildCalendarMonth(
      [
        trade({ id: "a", sellDate: "2026-11-05", pnlAbs: 150 }),
        trade({ id: "b", sellDate: "2026-11-05", pnlAbs: -40 }),
        trade({ id: "c", sellDate: "2026-11-05", pnlAbs: 10 }),
      ],
      "2026-11",
    );
    const day = cal.weeks.flat().find((d) => d.date === "2026-11-05")!;
    expect(day.trades).toHaveLength(3);
    expect(new Set(day.trades.map((t) => t.id))).toEqual(new Set(["a", "b", "c"]));
    expect(day.pnl).toBe(120);
    expect(cal.monthTotalPnl).toBe(120);
  });

  it("classifies each in-month trading day as win, loss, or neither (pnl === 0)", () => {
    const cal = buildCalendarMonth(
      [
        trade({ id: "win", sellDate: "2026-11-03", pnlAbs: 500 }),
        trade({ id: "loss", sellDate: "2026-11-04", pnlAbs: -200 }),
        trade({ id: "flat", sellDate: "2026-11-05", pnlAbs: 0 }),
      ],
      "2026-11",
    );
    expect(cal.tradingDayCount).toBe(3);
    expect(cal.winDayCount).toBe(1);
    expect(cal.lossDayCount).toBe(1);
  });

  it("a day with no closed trades has pnl: null, not pnl: 0 (never fabricates a flat day)", () => {
    const cal = buildCalendarMonth([], "2026-11");
    const day = cal.weeks.flat().find((d) => d.date === "2026-11-15")!;
    expect(day.pnl).toBeNull();
    expect(day.trades).toEqual([]);
  });

  it("still shows a trade that falls on a leading/trailing padding day, but excludes it from the month total", () => {
    // Dec 1 2026 is a padding day trailing November's grid.
    const cal = buildCalendarMonth([trade({ id: "spillover", sellDate: "2026-12-01", pnlAbs: 999 })], "2026-11");
    const paddingDay = cal.weeks.flat().find((d) => d.date === "2026-12-01")!;
    expect(paddingDay.inMonth).toBe(false);
    expect(paddingDay.trades).toHaveLength(1); // still visible, not hidden
    expect(cal.monthTotalPnl).toBe(0); // but not counted in November's own total
  });

  it("ignores trades entirely outside the displayed grid", () => {
    const cal = buildCalendarMonth([trade({ sellDate: "2020-01-01", pnlAbs: 999 })], "2026-11");
    expect(cal.monthTotalPnl).toBe(0);
    expect(cal.weeks.flat().every((d) => d.trades.length === 0)).toBe(true);
  });

  it("rejects a malformed month key rather than silently showing the wrong month", () => {
    expect(() => buildCalendarMonth([], "2026-13")).toThrow();
    expect(() => buildCalendarMonth([], "not-a-month")).toThrow();
  });

  it("produces a human-readable label", () => {
    expect(buildCalendarMonth([], "2026-11").label).toBe("November 2026");
  });
});

describe("shiftMonth", () => {
  it("moves forward and backward within a year", () => {
    expect(shiftMonth("2026-06", 1)).toBe("2026-07");
    expect(shiftMonth("2026-06", -1)).toBe("2026-05");
  });

  it("rolls over December -> January into the next year", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("rolls over January -> December into the previous year", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("handles a multi-month jump across a year boundary", () => {
    expect(shiftMonth("2026-11", 3)).toBe("2027-02");
  });
});

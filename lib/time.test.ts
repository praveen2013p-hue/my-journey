import { describe, expect, it } from "vitest";
import { parseIstAlertTime, weekEndingForAlert, weekEndingFromMonday } from "./time";

describe("weekEndingForAlert", () => {
  it("Mon-Fri in India maps to that week's Friday", () => {
    // Tuesday 20 Nov 2026 10:00 IST
    const instant = parseIstAlertTime("2026-11-17 10:00");
    expect(weekEndingForAlert(instant, "IN")).toBe("2026-11-20");
  });

  it("Friday close in India maps to the same Friday", () => {
    const instant = parseIstAlertTime("2026-11-20 15:45");
    expect(weekEndingForAlert(instant, "IN")).toBe("2026-11-20");
  });

  it("a Saturday-IST US alert (Friday US close) maps to that week's Friday in US time", () => {
    // US market closes Fri 20 Nov 2026 16:00 America/New_York (EST, UTC-5)
    // = Sat 21 Nov 2026 02:30 IST (UTC+5:30).
    const instant = parseIstAlertTime("2026-11-21 02:30");
    expect(weekEndingForAlert(instant, "US")).toBe("2026-11-20");
  });

  it("a plain Sunday-IST alert maps to the previous Friday", () => {
    const instant = parseIstAlertTime("2026-11-22 09:00");
    expect(weekEndingForAlert(instant, "IN")).toBe("2026-11-20");
  });
});

describe("weekEndingFromMonday", () => {
  it("adds 4 days to the Monday bar-open date", () => {
    expect(weekEndingFromMonday("2026-11-16")).toBe("2026-11-20");
  });
});

describe("parseIstAlertTime", () => {
  it("throws on an unparseable string rather than silently returning Invalid Date", () => {
    expect(() => parseIstAlertTime("not-a-date")).toThrow();
  });
});

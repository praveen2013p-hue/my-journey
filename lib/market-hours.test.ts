import { describe, expect, it } from "vitest";
import { isMarketOpen } from "./market-hours";

describe("isMarketOpen", () => {
  it("India is open on a weekday within 09:15-15:30 IST", () => {
    // Tue 24 Nov 2026 12:00 IST = 06:30 UTC
    expect(isMarketOpen("IN", new Date("2026-11-24T06:30:00Z"))).toBe(true);
  });

  it("India is closed before 09:15 IST", () => {
    // Tue 24 Nov 2026 08:00 IST = 02:30 UTC
    expect(isMarketOpen("IN", new Date("2026-11-24T02:30:00Z"))).toBe(false);
  });

  it("India is closed on Saturday even during trading hours", () => {
    // Sat 21 Nov 2026 12:00 IST
    expect(isMarketOpen("IN", new Date("2026-11-21T06:30:00Z"))).toBe(false);
  });

  it("US is open on a weekday within 09:30-16:00 America/New_York (EST, UTC-5 in November)", () => {
    // Tue 24 Nov 2026 11:00 EST = 16:00 UTC
    expect(isMarketOpen("US", new Date("2026-11-24T16:00:00Z"))).toBe(true);
  });

  it("US is closed before 09:30 America/New_York", () => {
    // Tue 24 Nov 2026 08:00 EST = 13:00 UTC
    expect(isMarketOpen("US", new Date("2026-11-24T13:00:00Z"))).toBe(false);
  });
});

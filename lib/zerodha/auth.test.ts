import { describe, expect, it } from "vitest";
import { next6amIst } from "./auth";

describe("next6amIst", () => {
  it("returns 6am IST later the same day, when called before 6am IST", () => {
    // 2026-11-24 03:00 IST = 2026-11-23 21:30 UTC
    const from = new Date("2026-11-23T21:30:00.000Z");
    // 2026-11-24 06:00 IST = 2026-11-24 00:30 UTC
    expect(next6amIst(from).toISOString()).toBe("2026-11-24T00:30:00.000Z");
  });

  it("rolls over to 6am IST the next day, when called after 6am IST", () => {
    // 2026-11-24 10:00 IST = 2026-11-24 04:30 UTC
    const from = new Date("2026-11-24T04:30:00.000Z");
    // 2026-11-25 06:00 IST = 2026-11-25 00:30 UTC
    expect(next6amIst(from).toISOString()).toBe("2026-11-25T00:30:00.000Z");
  });

  it("treats exactly 6am IST itself as already passed (rolls to the next day)", () => {
    // 2026-11-24 06:00 IST = 2026-11-24 00:30 UTC
    const from = new Date("2026-11-24T00:30:00.000Z");
    expect(next6amIst(from).toISOString()).toBe("2026-11-25T00:30:00.000Z");
  });
});

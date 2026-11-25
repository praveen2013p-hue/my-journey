import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMarketSnapshot } from "./market-snapshot";

describe("getMarketSnapshot", () => {
  describe("India (no KITE_API_KEY in tests, so no Zerodha session)", () => {
    it("marks every India index unavailable rather than substituting a different provider's numbers", async () => {
      const snapshot = await getMarketSnapshot("IN");
      expect(snapshot.map((i) => i.label)).toEqual(["Nifty 50", "Sensex", "Nifty Midcap 100", "Nifty Smallcap 100"]);
      expect(snapshot.every((i) => i.unavailable && i.value === null && i.changePct === null)).toBe(true);
    });
  });

  describe("US (forced to the mock provider)", () => {
    beforeEach(() => {
      process.env.FORCE_MOCK_US = "true";
    });
    afterEach(() => {
      delete process.env.FORCE_MOCK_US;
    });

    it("returns S&P 500, Nasdaq and Dow Jones with a value and change%, never unavailable", async () => {
      const snapshot = await getMarketSnapshot("US");
      expect(snapshot.map((i) => i.label)).toEqual(["S&P 500", "Nasdaq", "Dow Jones"]);
      for (const item of snapshot) {
        expect(item.unavailable).toBe(false);
        expect(item.value).not.toBeNull();
        expect(item.changePct).not.toBeNull();
      }
    });
  });
});

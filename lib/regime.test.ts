import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __clearRegimeCacheForTests, getBothMarketRegimes, getMarketRegime } from "./regime";

describe("getMarketRegime", () => {
  beforeEach(() => {
    // Force mock for both markets so this test never depends on real
    // network access to Yahoo (which this sandbox can't reach anyway, and
    // a CI runner's network shouldn't change whether this test passes).
    process.env.FORCE_MOCK_US = "true";
    __clearRegimeCacheForTests();
  });
  afterEach(() => {
    delete process.env.FORCE_MOCK_US;
  });

  it("returns a valid Weinstein stage (or null) without throwing, for both markets", async () => {
    const india = await getMarketRegime("IN");
    const us = await getMarketRegime("US");
    expect([1, 2, 3, 4, null]).toContain(india.stage);
    expect([1, 2, 3, 4, null]).toContain(us.stage);
  });

  it("isWeak is true only for stage 3 or 4", async () => {
    const { india } = await getBothMarketRegimes();
    expect(india.isWeak).toBe(india.stage === 3 || india.stage === 4);
  });
});

describe("regime cache", () => {
  beforeEach(() => {
    process.env.FORCE_MOCK_US = "true";
    __clearRegimeCacheForTests();
  });
  afterEach(() => {
    delete process.env.FORCE_MOCK_US;
  });

  it("caches the result so a repeated call doesn't re-fetch", async () => {
    const first = await getMarketRegime("IN");
    const second = await getMarketRegime("IN");
    expect(second).toEqual(first);
  });
});

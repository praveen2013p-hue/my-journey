import { beforeEach, describe, expect, it } from "vitest";
import { withSectorRs } from "./constituent-rs";
import { upsertAlert } from "./db/alerts";
import { __resetStoreForTests } from "./db/local-store";

const alertInput = (overrides: Partial<Parameters<typeof upsertAlert>[0]> = {}) => ({
  market: "IN" as const,
  exchange: "NSE",
  ticker: "SBIN",
  signal_type: "breakout" as const,
  grade: "A" as const,
  week_ending: "2026-11-20",
  triggered_at: "2026-11-20T15:45:00+05:30",
  trigger_price: 100,
  open: null,
  high: null,
  low: null,
  volume: null,
  breakout_level: null,
  vol_ratio: null,
  mrs: 0,
  pct_above_ma: null,
  overhead_pct: null,
  sector: "PSU Bank",
  industry: null,
  fundamentals: null,
  raw: {},
  ...overrides,
});

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("withSectorRs", () => {
  it("flags a stock well above its sector's median RS as a leader", async () => {
    await upsertAlert(alertInput({ ticker: "SBIN", mrs: 10 }));
    await upsertAlert(alertInput({ ticker: "BANKBARODA", mrs: -2 }));
    await upsertAlert(alertInput({ ticker: "PNB", mrs: 0 }));

    const rows = await withSectorRs("IN", [
      { ticker: "SBIN", exchange: "NSE", providerSymbol: "SBIN" },
      { ticker: "BANKBARODA", exchange: "NSE", providerSymbol: "BANKBARODA" },
      { ticker: "PNB", exchange: "NSE", providerSymbol: "PNB" },
    ]);

    const sbin = rows.find((r) => r.ticker === "SBIN")!;
    const bankbaroda = rows.find((r) => r.ticker === "BANKBARODA")!;
    expect(sbin.vsSectorRs).toBe("leader"); // median is 0, SBIN is 10
    expect(bankbaroda.vsSectorRs).toBe("laggard");
  });

  it("leaves vsSectorRs null for a constituent that's never alerted", async () => {
    const rows = await withSectorRs("IN", [{ ticker: "NEVERALERTED", exchange: null, providerSymbol: null }]);
    expect(rows[0].mrs).toBeNull();
    expect(rows[0].vsSectorRs).toBeNull();
    expect(rows[0].rsRating).toBeNull();
  });
});

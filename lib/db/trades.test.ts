import { beforeEach, describe, expect, it } from "vitest";
import { __resetStoreForTests } from "./local-store";
import { createTrade, deleteAllTrades, listTrades } from "./trades";

const USER_ID = "user@example.com";

function sampleTrade(overrides: Partial<Parameters<typeof createTrade>[1]> = {}) {
  return {
    market: "IN" as const,
    ticker: "SBIN",
    buy_date: "2026-11-01",
    quantity: 10,
    buy_price: 500,
    sell_date: null,
    sell_price: null,
    strategy_tag_id: null,
    alert_id: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("deleteAllTrades", () => {
  it("deletes every trade for one market, and returns how many were deleted", async () => {
    await createTrade(USER_ID, sampleTrade({ market: "IN", ticker: "SBIN" }));
    await createTrade(USER_ID, sampleTrade({ market: "IN", ticker: "TCS" }));

    const deletedCount = await deleteAllTrades(USER_ID, "IN");
    expect(deletedCount).toBe(2);
    expect(await listTrades(USER_ID, "IN")).toEqual([]);
  });

  it("never touches the other market's trades", async () => {
    await createTrade(USER_ID, sampleTrade({ market: "IN", ticker: "SBIN" }));
    await createTrade(USER_ID, sampleTrade({ market: "US", ticker: "AAPL", buy_price: 180 }));

    await deleteAllTrades(USER_ID, "IN");

    const usTrades = await listTrades(USER_ID, "US");
    expect(usTrades).toHaveLength(1);
    expect(usTrades[0].ticker).toBe("AAPL");
  });

  it("never touches another user's trades", async () => {
    await createTrade(USER_ID, sampleTrade());
    await createTrade("someone-else@example.com", sampleTrade());

    await deleteAllTrades(USER_ID, "IN");

    expect(await listTrades("someone-else@example.com", "IN")).toHaveLength(1);
  });

  it("returns 0 when there's nothing to delete", async () => {
    expect(await deleteAllTrades(USER_ID, "IN")).toBe(0);
  });
});

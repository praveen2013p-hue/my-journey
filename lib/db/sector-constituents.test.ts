import { beforeEach, describe, expect, it } from "vitest";
import { __resetStoreForTests } from "./local-store";
import {
  getConstituentCounts,
  listConstituents,
  listSectorsForTicker,
  listSectorsWithConstituents,
  replaceConstituents,
} from "./sector-constituents";

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("replaceConstituents", () => {
  it("stores tickers, de-duplicated and uppercased", async () => {
    await replaceConstituents("IN", "PSU Bank", ["sbin", "SBIN", " bankbaroda "]);
    const tickers = await listConstituents("IN", "PSU Bank");
    expect(tickers.sort()).toEqual(["BANKBARODA", "SBIN"]);
  });

  it("a second upload replaces the whole list rather than merging with the first", async () => {
    await replaceConstituents("IN", "PSU Bank", ["SBIN", "BANKBARODA"]);
    await replaceConstituents("IN", "PSU Bank", ["SBIN"]);
    const tickers = await listConstituents("IN", "PSU Bank");
    expect(tickers).toEqual(["SBIN"]);
  });

  it("listSectorsForTicker finds every sector a ticker belongs to", async () => {
    await replaceConstituents("IN", "PSU Bank", ["SBIN"]);
    await replaceConstituents("IN", "Bank", ["SBIN", "AXISBANK"]);
    const sectors = await listSectorsForTicker("IN", "SBIN");
    expect(sectors.sort()).toEqual(["Bank", "PSU Bank"]);
  });

  it("listSectorsWithConstituents and getConstituentCounts reflect what's uploaded", async () => {
    await replaceConstituents("IN", "PSU Bank", ["SBIN", "BANKBARODA"]);
    const withData = await listSectorsWithConstituents("IN");
    expect(withData.has("PSU Bank")).toBe(true);
    expect(withData.has("IT")).toBe(false);

    const counts = await getConstituentCounts("IN");
    expect(counts["PSU Bank"]).toBe(2);
  });
});

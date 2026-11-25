import { beforeEach, describe, expect, it } from "vitest";
import { __resetStoreForTests } from "./local-store";
import { resolveOrCreateSymbolMapping } from "./symbol-map";
import {
  getConstituentCounts,
  getConstituentQuoteRows,
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

describe("getConstituentQuoteRows", () => {
  it("resolves each ticker's provider symbol in one batch, sorted alphabetically", async () => {
    await replaceConstituents("IN", "PSU Bank", ["SBIN", "BANKBARODA"]);
    await resolveOrCreateSymbolMapping("IN", "SBIN", "NSE"); // simple ticker -> auto-mapped

    const rows = await getConstituentQuoteRows("IN", "PSU Bank");
    expect(rows.map((r) => r.ticker)).toEqual(["BANKBARODA", "SBIN"]); // alphabetical, not upload order
    const sbin = rows.find((r) => r.ticker === "SBIN")!;
    expect(sbin.exchange).toBe("NSE");
    expect(sbin.providerSymbol).toBe("SBIN");
  });

  it("leaves a ticker that's never appeared in an alert as unmapped (price unavailable), not a guess", async () => {
    await replaceConstituents("IN", "PSU Bank", ["SBIN"]);
    const rows = await getConstituentQuoteRows("IN", "PSU Bank");
    expect(rows).toEqual([{ ticker: "SBIN", exchange: null, providerSymbol: null }]);
  });

  it("returns an empty array for a sector with no uploaded constituents", async () => {
    expect(await getConstituentQuoteRows("IN", "Media")).toEqual([]);
  });
});

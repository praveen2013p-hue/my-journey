import { beforeEach, describe, expect, it } from "vitest";
import { __resetStoreForTests } from "./local-store";
import { listUnmappedSymbols, resolveOrCreateSymbolMapping } from "./symbol-map";

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("resolveOrCreateSymbolMapping", () => {
  it("auto-maps an unambiguous ticker with no special characters", async () => {
    const row = await resolveOrCreateSymbolMapping("IN", "SBIN", "NSE");
    expect(row.status).toBe("mapped");
    expect(row.kite_symbol).toBe("SBIN");
    expect(row.yahoo_symbol).toBe("SBIN");
  });

  it("leaves a ticker with a special character unmapped for manual review", async () => {
    const row = await resolveOrCreateSymbolMapping("IN", "M&M", "NSE");
    expect(row.status).toBe("unmapped");
    expect(row.kite_symbol).toBeNull();
    expect(row.notes).not.toBeNull();
  });

  it("is idempotent - a second call for the same ticker returns the same row, not a duplicate", async () => {
    const first = await resolveOrCreateSymbolMapping("IN", "SBIN", "NSE");
    const second = await resolveOrCreateSymbolMapping("IN", "SBIN", "NSE");
    expect(second.id).toBe(first.id);
  });

  it("listUnmappedSymbols only returns tickers that need manual confirmation", async () => {
    await resolveOrCreateSymbolMapping("IN", "SBIN", "NSE");
    await resolveOrCreateSymbolMapping("IN", "M&M", "NSE");
    await resolveOrCreateSymbolMapping("US", "BRK.B", "NYSE");

    const unmapped = await listUnmappedSymbols();
    expect(unmapped.map((s) => s.tv_ticker).sort()).toEqual(["BRK.B", "M&M"]);
  });
});

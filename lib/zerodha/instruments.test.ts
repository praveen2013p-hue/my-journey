import { describe, expect, it } from "vitest";
import { parseIndexInstruments, parseTokensBySymbol, sectorSearchKeyword } from "./instruments";

describe("parseTokensBySymbol", () => {
  it("parses instrument_token and tradingsymbol from a normal row", () => {
    const csv =
      "instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange\n" +
      "779521,3045,SBIN,STATE BANK OF INDIA,0,,0,0.05,1,EQ,NSE,NSE";
    const map = parseTokensBySymbol(csv);
    expect(map.get("SBIN")).toBe(779521);
  });

  it("is not thrown off by a comma embedded in the name field", () => {
    // "name" (which comes AFTER tradingsymbol) containing a comma must not
    // shift the token/tradingsymbol columns we actually read.
    const csv =
      "instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange\n" +
      '408065,1594,MUTHOOTFIN,"MUTHOOT FINANCE, LTD",0,,0,0.05,1,EQ,NSE,NSE';
    const map = parseTokensBySymbol(csv);
    expect(map.get("MUTHOOTFIN")).toBe(408065);
  });

  it("skips malformed rows instead of throwing", () => {
    const csv = "instrument_token,exchange_token,tradingsymbol,name\nnot-a-number,x,TICK,Some Name\n\n779521,3045,SBIN,STATE BANK OF INDIA";
    const map = parseTokensBySymbol(csv);
    expect(map.has("TICK")).toBe(false);
    expect(map.get("SBIN")).toBe(779521);
  });
});

describe("parseIndexInstruments", () => {
  const header = "instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange";

  it("only keeps rows whose segment is INDICES, not equities", () => {
    const csv =
      `${header}\n` +
      "779521,3045,SBIN,STATE BANK OF INDIA,0,,0,0.05,1,EQ,NSE,NSE\n" +
      "260105,1016,NIFTY BANK,NIFTY BANK,0,,0,0,0,EQ,INDICES,NSE";
    const rows = parseIndexInstruments(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ tradingsymbol: "NIFTY BANK", name: "NIFTY BANK" });
  });

  it("isn't thrown off by a comma embedded in a quoted name, even for an INDICES row", () => {
    const csv =
      `${header}\n` +
      '260106,1017,NIFTY IT,"NIFTY IT, SECTORAL",0,,0,0,0,EQ,INDICES,NSE';
    const rows = parseIndexInstruments(csv);
    expect(rows).toEqual([{ tradingsymbol: "NIFTY IT", name: "NIFTY IT, SECTORAL" }]);
  });

  it("returns an empty array for CSV with no INDICES rows", () => {
    const csv = `${header}\n779521,3045,SBIN,STATE BANK OF INDIA,0,,0,0.05,1,EQ,NSE,NSE`;
    expect(parseIndexInstruments(csv)).toEqual([]);
  });
});

describe("sectorSearchKeyword", () => {
  it("strips a parenthetical aside", () => {
    expect(sectorSearchKeyword("PSE (PSU cos)")).toBe("PSE");
  });

  it("strips an ampersand TradingView carries but Kite's index names don't", () => {
    expect(sectorSearchKeyword("EV & New Auto")).toBe("EV New Auto");
  });

  it("leaves an already-clean name untouched", () => {
    expect(sectorSearchKeyword("Capital Markets")).toBe("Capital Markets");
  });
});

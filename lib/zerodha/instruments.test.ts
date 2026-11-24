import { describe, expect, it } from "vitest";
import { parseTokensBySymbol } from "./instruments";

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

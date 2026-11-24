/**
 * Static sector/industry reference data, BRIEF.md section 5c.
 *
 * India: the brief names 28 sector indices but gives explicit TradingView
 * symbols for only 4 of them (Bank, PSU Bank, IT, Defence) - the rest are
 * meant to be "resolved at runtime from the [Kite] instruments dump," which
 * needs a live Zerodha connection this app doesn't have yet. Seeding a
 * symbol I'm not sure of would silently fetch the wrong index's data, so
 * the other 24 are seeded with `tv_symbol: null` and show up in Settings
 * as unresolved - same honesty principle as the unmapped-ticker report.
 *
 * US: the brief gives an exact symbol for all 11 sectors + 18 industries,
 * so every one of those is fully seeded.
 */

export interface SectorMapSeed {
  market: "IN" | "US";
  display_name: string;
  tv_symbol: string | null;
  kind: "sector" | "industry";
}

const INDIA_SECTORS_WITH_KNOWN_SYMBOL: Record<string, string> = {
  Bank: "NSE:BANKNIFTY",
  "PSU Bank": "NSE:CNXPSUBANK",
  IT: "NSE:CNXIT",
  Defence: "NSE:NIFTY_IND_DEFENCE",
};

const INDIA_SECTOR_NAMES = [
  "Bank",
  "PSU Bank",
  "Private Bank",
  "Financial Svcs",
  "Capital Markets",
  "IT",
  "Auto",
  "EV & New Auto",
  "Pharma",
  "Healthcare",
  "FMCG",
  "Consumption",
  "Cons Durables",
  "Metal",
  "Commodities",
  "Chemicals",
  "Energy",
  "Oil & Gas",
  "Realty",
  "Housing",
  "Infrastructure",
  "Manufacturing",
  "Defence",
  "Railways PSU",
  "PSE",
  "Media",
  "Digital",
  "Tourism",
];

const US_SECTORS: Record<string, string> = {
  Technology: "AMEX:XLK",
  Financials: "AMEX:XLF",
  Energy: "AMEX:XLE",
  "Health Care": "AMEX:XLV",
  "Cons Discretionary": "AMEX:XLY",
  "Cons Staples": "AMEX:XLP",
  Industrials: "AMEX:XLI",
  Materials: "AMEX:XLB",
  Utilities: "AMEX:XLU",
  "Real Estate": "AMEX:XLRE",
  "Comm Services": "AMEX:XLC",
};

const US_INDUSTRIES: Record<string, string> = {
  Semiconductors: "NASDAQ:SMH",
  Software: "CBOE:IGV",
  Cybersecurity: "NASDAQ:CIBR",
  "Cloud Computing": "NASDAQ:SKYY",
  Biotech: "AMEX:XBI",
  Pharma: "AMEX:XPH",
  "Medical Devices": "AMEX:IHI",
  "Regional Banks": "AMEX:KRE",
  Homebuilders: "AMEX:XHB",
  "Home Construction": "CBOE:ITB",
  Retail: "AMEX:XRT",
  "Aerospace & Defense": "CBOE:ITA",
  "Oil & Gas E&P": "AMEX:XOP",
  "Oil Services": "AMEX:OIH",
  Airlines: "AMEX:JETS",
  "Metals & Mining": "AMEX:XME",
  "Gold Miners": "AMEX:GDX",
  Solar: "AMEX:TAN",
};

export const SECTOR_MAP_SEED: SectorMapSeed[] = [
  ...INDIA_SECTOR_NAMES.map((name) => ({
    market: "IN" as const,
    display_name: name,
    tv_symbol: INDIA_SECTORS_WITH_KNOWN_SYMBOL[name] ?? null,
    kind: "sector" as const,
  })),
  ...Object.entries(US_SECTORS).map(([name, symbol]) => ({
    market: "US" as const,
    display_name: name,
    tv_symbol: symbol,
    kind: "sector" as const,
  })),
  ...Object.entries(US_INDUSTRIES).map(([name, symbol]) => ({
    market: "US" as const,
    display_name: name,
    tv_symbol: symbol,
    kind: "industry" as const,
  })),
];

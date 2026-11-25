/**
 * "Double RS confirmation" (DECISIONS.md backlog): whether a sector
 * constituent's own RS leads or lags its sector's median RS. Lives in
 * its own file rather than inside lib/db/sector-constituents.ts because
 * that file is imported by lib/sector-context.ts, which lib/db/alerts.ts
 * also imports - adding an alerts.ts import directly into
 * sector-constituents.ts would create a module cycle.
 */

import { getLatestMrsForAllTickers, getLatestMrsForTickers } from "./db/alerts";
import type { ConstituentQuoteRow } from "./db/sector-constituents";
import type { Market } from "./db/schema-types";
import { classifyVsSectorRs, computeRsRatingPercentiles, sectorMedianMrs, type SectorRsComparison } from "./rs-rating";

export interface ConstituentRsRow extends ConstituentQuoteRow {
  /** This ticker's own mrs from its latest alert - null if it's never alerted. */
  mrs: number | null;
  /** 1-99 percentile among every ticker this app has an RS value for in this market. */
  rsRating: number | null;
  /** This ticker's mrs vs this sector's median mrs - null if either side is unknown. */
  vsSectorRs: SectorRsComparison | null;
}

export async function withSectorRs(market: Market, rows: ConstituentQuoteRow[]): Promise<ConstituentRsRow[]> {
  const tickers = rows.map((r) => r.ticker);
  const [mrsByTicker, rsRatingByTicker] = await Promise.all([
    getLatestMrsForTickers(market, tickers),
    getLatestMrsForAllTickers(market).then(computeRsRatingPercentiles),
  ]);
  const median = sectorMedianMrs(Array.from(mrsByTicker.values()).filter((v): v is number => v !== null));

  return rows.map((row) => {
    const mrs = mrsByTicker.get(row.ticker) ?? null;
    return {
      ...row,
      mrs,
      rsRating: rsRatingByTicker.get(row.ticker) ?? null,
      vsSectorRs: mrs !== null && median !== null ? classifyVsSectorRs(mrs, median) : null,
    };
  });
}

/**
 * Pure RS-ranking helpers, backlog items "Stock RS Rating" and "double RS
 * confirmation" (DECISIONS.md). Both work off whatever `mrs` (Mansfield
 * RS) values are already known from alerts - there's no attempt to rank
 * against "the whole market," only against every ticker this app has
 * ever seen an RS value for. A ticker that's never triggered an alert
 * simply has no rating, never a guessed one.
 */

/**
 * A 1-99 percentile rank for each ticker's RS among every other ticker
 * with a known RS (IBD-style RS Rating, but against this app's own
 * tracked universe, not the whole market). `percentile = round(share of
 * tickers with mrs <= this one's mrs * 100)`, clamped to [1, 99] so a
 * single highest/lowest value never claims an exact 0 or 100.
 */
export function computeRsRatingPercentiles(mrsByTicker: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  const values = Array.from(mrsByTicker.values()).sort((a, b) => a - b);
  const n = values.length;
  if (n === 0) return result;

  for (const [ticker, mrs] of mrsByTicker) {
    let countLessOrEqual = 0;
    for (const v of values) if (v <= mrs) countLessOrEqual += 1;
    const raw = Math.round((countLessOrEqual / n) * 100);
    result.set(ticker, Math.min(99, Math.max(1, raw)));
  }
  return result;
}

export type SectorRsComparison = "leader" | "laggard" | "inline";

/**
 * Whether a stock's own RS is ahead of, behind, or in line with its
 * sector's median RS - "double RS confirmation": a stock riding a hot
 * sector isn't automatically a leader within it.
 */
export function classifyVsSectorRs(stockMrs: number, sectorMedianMrs: number, tolerance = 0.5): SectorRsComparison {
  const diff = stockMrs - sectorMedianMrs;
  if (Math.abs(diff) <= tolerance) return "inline";
  return diff > 0 ? "leader" : "laggard";
}

/** The median of a sector's constituents' known mrs values, or null if none have one yet. */
export function sectorMedianMrs(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

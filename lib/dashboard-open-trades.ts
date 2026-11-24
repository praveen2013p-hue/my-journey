/**
 * Dashboard widget 4 (BRIEF.md §7.3): open positions with live P&L and
 * realised total, India and US always kept separate. Reuses the same
 * per-market assembly as the Journal page (lib/journal-data.ts) rather
 * than re-deriving it, so the two pages can never disagree about what
 * counts as "open" or how P&L is computed.
 */

import { getJournalPageData, type TradeRowView } from "./journal-data";

export interface MarketOpenTradesData {
  rows: TradeRowView[];
  realizedPnl: number;
}

export interface OpenTradesWidgetData {
  india: MarketOpenTradesData;
  us: MarketOpenTradesData;
}

export async function getOpenTradesWidgetData(userId: string): Promise<OpenTradesWidgetData> {
  const [india, us] = await Promise.all([getJournalPageData(userId, "IN"), getJournalPageData(userId, "US")]);
  return {
    india: { rows: india.openTrades, realizedPnl: india.stats.realizedPnl },
    us: { rows: us.openTrades, realizedPnl: us.stats.realizedPnl },
  };
}

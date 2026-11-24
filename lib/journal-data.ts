/**
 * Server-side data assembly for the Journal page (BRIEF.md §7.4). Mirrors
 * the pattern in lib/breakouts-data.ts and lib/sectors-page-data.ts: this
 * does all the DB reads and math, the page component just renders.
 */

import { listAlerts } from "./db/alerts";
import { listStrategyTags } from "./db/strategy-tags";
import { getSymbolMapping } from "./db/symbol-map";
import { listTrades } from "./db/trades";
import type { Market, TradeRow } from "./db/schema-types";
import {
  closedTradePnl,
  computeStrategyResults,
  computeTradeStats,
  type ClosedTradeResult,
  type StrategyResult,
  type TradeStatsSummary,
} from "./trade-stats";

export interface TradeRowView {
  trade: TradeRow;
  exchange: string | null;
  providerSymbol: string | null;
  strategyTagName: string;
}

export interface ClosedTradeRowView extends TradeRowView {
  pnlAbs: number;
  pnlPct: number;
  holdingDays: number;
}

export interface TickerOption {
  market: Market;
  exchange: string;
  ticker: string;
}

export interface JournalPageData {
  openTrades: TradeRowView[];
  closedTrades: ClosedTradeRowView[];
  stats: TradeStatsSummary;
  strategyResults: StrategyResult[];
  strategyTags: Array<{ id: string; name: string }>;
  tickerOptions: TickerOption[];
}

export async function getJournalPageData(userId: string, market: Market): Promise<JournalPageData> {
  const [trades, tags, alerts] = await Promise.all([
    listTrades(userId, market),
    listStrategyTags(userId),
    listAlerts({ market }),
  ]);

  const tagNamesById = new Map(tags.map((t) => [t.id, t.name]));

  const tickerOptionsByTicker = new Map<string, TickerOption>();
  for (const a of alerts) {
    if (!tickerOptionsByTicker.has(a.ticker)) {
      tickerOptionsByTicker.set(a.ticker, { market: a.market, exchange: a.exchange, ticker: a.ticker });
    }
  }
  const tickerOptions = Array.from(tickerOptionsByTicker.values()).sort((a, b) =>
    a.ticker.localeCompare(b.ticker),
  );

  const symbolCache = new Map<string, string | null>();
  async function providerSymbolFor(ticker: string): Promise<string | null> {
    if (symbolCache.has(ticker)) return symbolCache.get(ticker) ?? null;
    const mapping = await getSymbolMapping(market, ticker);
    const symbol =
      mapping?.status === "mapped" ? (market === "IN" ? mapping.kite_symbol : mapping.yahoo_symbol) : null;
    symbolCache.set(ticker, symbol);
    return symbol;
  }

  const openTrades: TradeRowView[] = [];
  const closedResults: ClosedTradeResult[] = [];
  const closedTrades: ClosedTradeRowView[] = [];

  for (const trade of trades) {
    const strategyTagName = trade.strategy_tag_id
      ? tagNamesById.get(trade.strategy_tag_id) ?? "Unknown tag"
      : "Untagged";
    const exchange = tickerOptionsByTicker.get(trade.ticker)?.exchange ?? null;
    const closed = closedTradePnl(trade);

    if (closed) {
      closedResults.push(closed);
      closedTrades.push({
        trade,
        exchange,
        providerSymbol: null,
        strategyTagName,
        pnlAbs: closed.pnlAbs,
        pnlPct: closed.pnlPct,
        holdingDays: closed.holdingDays,
      });
    } else {
      openTrades.push({ trade, exchange, providerSymbol: await providerSymbolFor(trade.ticker), strategyTagName });
    }
  }

  openTrades.sort((a, b) => (a.trade.buy_date < b.trade.buy_date ? 1 : -1));
  closedTrades.sort((a, b) => ((a.trade.sell_date as string) < (b.trade.sell_date as string) ? 1 : -1));

  return {
    openTrades,
    closedTrades,
    stats: computeTradeStats(closedResults),
    strategyResults: computeStrategyResults(closedResults, tagNamesById),
    strategyTags: tags.map((t) => ({ id: t.id, name: t.name })),
    tickerOptions,
  };
}

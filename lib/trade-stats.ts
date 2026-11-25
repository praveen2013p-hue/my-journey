/**
 * Pure P&L / stats math for the Journal summary cards (BRIEF.md §7.4) and
 * the Performance page's trade stats (§15.1). No I/O here - callers pass
 * in trades (already filtered to one market, since India ₹ and US $ are
 * never combined) and live prices; this file only does arithmetic, so it
 * can be unit-tested without a database or network call.
 */

import type { TradeRow } from "./db/schema-types";

export function isTradeClosed(trade: TradeRow): boolean {
  return trade.sell_date !== null && trade.sell_price !== null;
}

export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const from = new Date(`${fromIsoDate}T00:00:00Z`).getTime();
  const to = new Date(`${toIsoDate}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

export interface ClosedTradeResult {
  trade: TradeRow;
  pnlAbs: number;
  pnlPct: number;
  holdingDays: number;
  /** (sellPrice - buyPrice) / (buyPrice - stopLoss) - null when no stop was set, or the stop wasn't below the buy price (so there's no defined risk to divide by). Never a guessed value. */
  rMultiple: number | null;
}

export interface OpenTradeResult {
  trade: TradeRow;
  livePrice: number | null;
  pnlAbs: number | null;
  pnlPct: number | null;
  holdingDays: number;
}

/** This app only ever tracks a buy then a sell (no short-side field) - risk per share is buy price minus stop, so a stop at or above the buy price has no defined risk to divide by. */
export function rMultiple(trade: TradeRow, sellPrice: number): number | null {
  if (trade.stop_loss === null) return null;
  const riskPerShare = trade.buy_price - trade.stop_loss;
  if (riskPerShare <= 0) return null;
  return (sellPrice - trade.buy_price) / riskPerShare;
}

export function closedTradePnl(trade: TradeRow): ClosedTradeResult | null {
  if (!isTradeClosed(trade)) return null;
  const sellPrice = trade.sell_price as number;
  const sellDate = trade.sell_date as string;
  const pnlAbs = (sellPrice - trade.buy_price) * trade.quantity;
  const pnlPct = ((sellPrice - trade.buy_price) / trade.buy_price) * 100;
  return {
    trade,
    pnlAbs,
    pnlPct,
    holdingDays: daysBetween(trade.buy_date, sellDate),
    rMultiple: rMultiple(trade, sellPrice),
  };
}

export function openTradePnl(
  trade: TradeRow,
  livePrice: number | null,
  todayIsoDate: string,
): OpenTradeResult {
  const pnlAbs = livePrice !== null ? (livePrice - trade.buy_price) * trade.quantity : null;
  const pnlPct = livePrice !== null ? ((livePrice - trade.buy_price) / trade.buy_price) * 100 : null;
  return { trade, livePrice, pnlAbs, pnlPct, holdingDays: daysBetween(trade.buy_date, todayIsoDate) };
}

export interface TradeStatsSummary {
  tradeCount: number;
  winRate: number | null; // 0-100, null if no closed trades
  avgGainPct: number | null; // average pnlPct of winning trades, null if none
  avgLossPct: number | null; // average pnlPct of losing trades (negative), null if none
  expectancyPct: number | null; // §7.3: win% x avg gain - loss% x avg loss
  realizedPnl: number;
  profitFactor: number | null; // gross win / gross loss; null if no losing trades yet (undefined ratio)
  bestTradePct: number | null;
  worstTradePct: number | null;
  avgHoldingDays: number | null;
  /**
   * Largest peak-to-trough decline in the cumulative realised-P&L curve,
   * in the trade's own currency. Not expressed as a % of capital - this
   * app never tracks account size, only per-trade P&L (BRIEF.md has no
   * "starting capital" concept), so a true percentage drawdown isn't
   * knowable. Documented in DECISIONS.md.
   */
  maxDrawdown: number;
  equityCurve: Array<{ date: string; cumulativePnl: number }>;
  /** Average R-multiple across closed trades that have one (a stop was set) - null if none do. */
  avgRMultiple: number | null;
}

const EMPTY_STATS: TradeStatsSummary = {
  tradeCount: 0,
  winRate: null,
  avgGainPct: null,
  avgLossPct: null,
  expectancyPct: null,
  realizedPnl: 0,
  profitFactor: null,
  bestTradePct: null,
  worstTradePct: null,
  avgHoldingDays: null,
  maxDrawdown: 0,
  equityCurve: [],
  avgRMultiple: null,
};

export function computeTradeStats(closedTrades: ClosedTradeResult[]): TradeStatsSummary {
  const n = closedTrades.length;
  if (n === 0) return EMPTY_STATS;

  const wins = closedTrades.filter((t) => t.pnlPct > 0);
  const losses = closedTrades.filter((t) => t.pnlPct < 0);
  const winRate = (wins.length / n) * 100;
  const lossRate = (losses.length / n) * 100;
  const avgGainPct = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : null;
  const avgLossPct = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : null;
  const expectancyPct = (winRate / 100) * (avgGainPct ?? 0) - (lossRate / 100) * Math.abs(avgLossPct ?? 0);

  const realizedPnl = closedTrades.reduce((s, t) => s + t.pnlAbs, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnlAbs, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlAbs, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;

  const pcts = closedTrades.map((t) => t.pnlPct);
  const bestTradePct = Math.max(...pcts);
  const worstTradePct = Math.min(...pcts);
  const avgHoldingDays = closedTrades.reduce((s, t) => s + t.holdingDays, 0) / n;

  const sorted = [...closedTrades].sort((a, b) =>
    (a.trade.sell_date as string) < (b.trade.sell_date as string) ? -1 : 1,
  );
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equityCurve: Array<{ date: string; cumulativePnl: number }> = [];
  for (const t of sorted) {
    cumulative += t.pnlAbs;
    equityCurve.push({ date: t.trade.sell_date as string, cumulativePnl: cumulative });
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const withR = closedTrades.filter((t) => t.rMultiple !== null);
  const avgRMultiple = withR.length > 0 ? withR.reduce((s, t) => s + t.rMultiple!, 0) / withR.length : null;

  return {
    tradeCount: n,
    winRate,
    avgGainPct,
    avgLossPct,
    expectancyPct,
    realizedPnl,
    profitFactor,
    bestTradePct,
    worstTradePct,
    avgHoldingDays,
    maxDrawdown,
    equityCurve,
    avgRMultiple,
  };
}

export interface StrategyResult {
  tagId: string | null;
  tagName: string;
  tradeCount: number;
  winRate: number | null;
  avgReturnPct: number;
  totalPnl: number;
}

/** Groups closed trades by strategy tag (BRIEF.md §7.4 "per-strategy results table"). */
export function computeStrategyResults(
  closedTrades: ClosedTradeResult[],
  tagNamesById: Map<string, string>,
): StrategyResult[] {
  const groups = new Map<string | null, ClosedTradeResult[]>();
  for (const t of closedTrades) {
    const key = t.trade.strategy_tag_id;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const results: StrategyResult[] = [];
  for (const [tagId, trades] of groups) {
    const wins = trades.filter((t) => t.pnlPct > 0).length;
    results.push({
      tagId,
      tagName: tagId ? tagNamesById.get(tagId) ?? "Unknown tag" : "Untagged",
      tradeCount: trades.length,
      winRate: trades.length > 0 ? (wins / trades.length) * 100 : null,
      avgReturnPct: trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length,
      totalPnl: trades.reduce((s, t) => s + t.pnlAbs, 0),
    });
  }
  return results.sort((a, b) => b.totalPnl - a.totalPnl);
}

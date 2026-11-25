/**
 * Server-side data assembly for the Performance page (BRIEF.md §15).
 * Three sections, each its own function so the page stays thin:
 *  - resolveTimeFrame: turns the preset/custom-range picker into dates.
 *  - getHoldVsSoldData: §15.2 "if I had held" per closed trade.
 *  - getShortlistPerformanceData: §15.3 every triggered stock, bought or not.
 * Trade stats (§15.1) reuse lib/trade-stats.ts directly from the page.
 */

import { addDays, format, startOfMonth, startOfYear, subDays, subMonths, subYears } from "date-fns";
import { getAlertsByIds, listAlerts } from "./db/alerts";
import { listTrades } from "./db/trades";
import { getSymbolMapping } from "./db/symbol-map";
import type { AlertRow, Market, TradeRow } from "./db/schema-types";
import { getDailyHistoryWithBackfill } from "./price-history-backfill";
import { getCachedQuotes } from "./quotes-cache";
import {
  computeGradeCalibration,
  computeQualityScoreCalibration,
  type GradeCalibrationRow,
  type QualityScoreBucketRow,
} from "./quality-calibration";
import { closedTradePnl } from "./trade-stats";

export type TimeFramePreset = "month" | "3m" | "6m" | "1y" | "ytd" | "all" | "custom";

export interface ResolvedTimeFrame {
  preset: TimeFramePreset;
  fromDate: string | null; // null = no lower bound ("All")
  toDate: string;
}

export function resolveTimeFrame(
  preset: string | undefined,
  customFrom: string | undefined,
  customTo: string | undefined,
): ResolvedTimeFrame {
  const today = new Date();
  const toDate = format(today, "yyyy-MM-dd");

  switch (preset) {
    case "month":
      return { preset: "month", fromDate: format(startOfMonth(today), "yyyy-MM-dd"), toDate };
    case "3m":
      return { preset: "3m", fromDate: format(subMonths(today, 3), "yyyy-MM-dd"), toDate };
    case "6m":
      return { preset: "6m", fromDate: format(subMonths(today, 6), "yyyy-MM-dd"), toDate };
    case "1y":
      return { preset: "1y", fromDate: format(subYears(today, 1), "yyyy-MM-dd"), toDate };
    case "ytd":
      return { preset: "ytd", fromDate: format(startOfYear(today), "yyyy-MM-dd"), toDate };
    case "custom":
      return {
        preset: "custom",
        fromDate: customFrom ?? format(subMonths(today, 3), "yyyy-MM-dd"),
        toDate: customTo ?? toDate,
      };
    case "all":
      return { preset: "all", fromDate: null, toDate };
    default:
      return { preset: "3m", fromDate: format(subMonths(today, 3), "yyyy-MM-dd"), toDate };
  }
}

function inRange(date: string, fromDate: string | null, toDate: string): boolean {
  if (date > toDate) return false;
  if (fromDate && date < fromDate) return false;
  return true;
}

export interface HoldVsSoldRow {
  trade: TradeRow;
  actualReturnPct: number;
  heldReturnPct: number | null;
  diffPts: number | null;
  verdict: "sold_too_early" | "good_exit" | "unknown";
  peakPriceAfterSell: number | null;
  pctMissedVsPeak: number | null;
}

export interface HoldVsSoldSummary {
  rows: HoldVsSoldRow[];
  totalActualPnl: number;
  totalHypotheticalHoldPnl: number;
  pctSoldTooEarly: number | null;
  avgReturnLeftOnTable: number | null;
  avgReturnSavedByExiting: number | null;
}

/** BRIEF.md §15.2 - labelled "indicative" per §17.4 (site math, not TradingView's own). */
export async function getHoldVsSoldData(userId: string, market: Market, timeFrame: ResolvedTimeFrame): Promise<HoldVsSoldSummary> {
  const trades = await listTrades(userId, market);
  const closed = trades
    .filter((t) => t.sell_date && inRange(t.sell_date, timeFrame.fromDate, timeFrame.toDate))
    .map((t) => ({ trade: t, closed: closedTradePnl(t)! }));

  const tickers = Array.from(new Set(closed.map((c) => c.trade.ticker)));
  // All symbol lookups and the quote batch run in parallel rather than one
  // ticker at a time - with a real market-data provider (Kite/Yahoo) each
  // of these is a network round trip, and this page can easily have
  // dozens of closed trades.
  const symbolEntries = await Promise.all(
    tickers.map(async (ticker) => {
      const mapping = await getSymbolMapping(market, ticker);
      const symbol = mapping?.status === "mapped" ? (market === "IN" ? mapping.kite_symbol : mapping.yahoo_symbol) : null;
      return [ticker, symbol] as const;
    }),
  );
  const symbolByTicker = new Map(symbolEntries);
  const knownSymbols = Array.from(symbolByTicker.values()).filter((s): s is string => s !== null);
  const quotes = await getCachedQuotes(market, knownSymbols);

  const rows: HoldVsSoldRow[] = await Promise.all(
    closed.map(async ({ trade, closed: c }) => {
      const symbol = symbolByTicker.get(trade.ticker) ?? null;
      const currentPrice = symbol ? quotes.get(symbol)?.price ?? null : null;
      const heldReturnPct = currentPrice !== null ? ((currentPrice - trade.buy_price) / trade.buy_price) * 100 : null;
      const diffPts = heldReturnPct !== null ? heldReturnPct - c.pnlPct : null;
      const verdict: HoldVsSoldRow["verdict"] =
        diffPts === null ? "unknown" : diffPts > 0 ? "sold_too_early" : "good_exit";

      let peakPriceAfterSell: number | null = null;
      let pctMissedVsPeak: number | null = null;
      if (symbol) {
        const history = await getDailyHistoryWithBackfill(
          market,
          trade.ticker,
          symbol,
          trade.sell_date as string,
          timeFrame.toDate,
        );
        if (history.length > 0) {
          peakPriceAfterSell = Math.max(...history.map((h) => h.close));
          pctMissedVsPeak = ((peakPriceAfterSell - (trade.sell_price as number)) / (trade.sell_price as number)) * 100;
        }
      }

      return { trade, actualReturnPct: c.pnlPct, heldReturnPct, diffPts, verdict, peakPriceAfterSell, pctMissedVsPeak };
    }),
  );

  const totalActualPnl = closed.reduce((s, c) => s + c.closed.pnlAbs, 0);
  const knownHeld = rows.filter((r) => r.heldReturnPct !== null);
  const totalHypotheticalHoldPnl = knownHeld.reduce(
    (sum, r) => sum + ((r.heldReturnPct as number) / 100) * r.trade.buy_price * r.trade.quantity,
    0,
  );
  const tooEarly = rows.filter((r) => r.verdict === "sold_too_early");
  const goodExits = rows.filter((r) => r.verdict === "good_exit");

  return {
    rows,
    totalActualPnl,
    totalHypotheticalHoldPnl,
    pctSoldTooEarly: knownHeld.length > 0 ? (tooEarly.length / knownHeld.length) * 100 : null,
    avgReturnLeftOnTable:
      tooEarly.length > 0 ? tooEarly.reduce((s, r) => s + (r.diffPts as number), 0) / tooEarly.length : null,
    avgReturnSavedByExiting:
      goodExits.length > 0
        ? goodExits.reduce((s, r) => s + -(r.diffPts as number), 0) / goodExits.length
        : null,
  };
}

export interface QualityCalibrationData {
  byGrade: GradeCalibrationRow[];
  byQualityScore: QualityScoreBucketRow[];
  /** How many closed trades in this window had no alert_id (or a since-deleted one) and so couldn't be calibrated. */
  uncalibratedCount: number;
}

/** "Quality Score calibration" (DECISIONS.md backlog) - whether Grade/Quality Score at trigger time actually predicted what happened. */
export async function getQualityCalibrationData(
  userId: string,
  market: Market,
  timeFrame: ResolvedTimeFrame,
): Promise<QualityCalibrationData> {
  const trades = await listTrades(userId, market);
  const closedInWindow = trades
    .filter((t) => t.sell_date && inRange(t.sell_date, timeFrame.fromDate, timeFrame.toDate))
    .map((t) => closedTradePnl(t)!);

  const alertIds = Array.from(
    new Set(closedInWindow.map((c) => c.trade.alert_id).filter((id): id is string => id !== null)),
  );
  const alertById = await getAlertsByIds(alertIds);

  const uncalibratedCount = closedInWindow.filter(
    (c) => c.trade.alert_id === null || !alertById.has(c.trade.alert_id),
  ).length;

  return {
    byGrade: computeGradeCalibration(closedInWindow, alertById),
    byQualityScore: computeQualityScoreCalibration(closedInWindow, alertById),
    uncalibratedCount,
  };
}

export interface ShortlistRow {
  alert: AlertRow;
  currentPrice: number | null;
  returnSinceTriggerPct: number | null;
  maxGainSinceTriggerPct: number | null;
  maxDrawdownSinceTriggerPct: number | null;
  bought: "yes" | "skipped";
}

export interface ShortlistSummary {
  rows: ShortlistRow[];
  avgReturnPct: number | null;
  pctInProfit: number | null;
  avgByGrade: Record<"A" | "B" | "C", number | null>;
  avgBreakoutPct: number | null;
  avgPullbackPct: number | null;
  avgBoughtPct: number | null;
  avgSkippedPct: number | null;
  top10: ShortlistRow[];
  bottom10: ShortlistRow[];
}

/**
 * BRIEF.md §15.3. "Max gain/drawdown since trigger" is a close-to-close
 * proxy (daily closes, not intraday highs/lows - DECISIONS.md), since
 * that's what price_history stores.
 */
export async function getShortlistPerformanceData(
  userId: string,
  market: Market,
  timeFrame: ResolvedTimeFrame,
): Promise<ShortlistSummary> {
  const [allAlerts, trades] = await Promise.all([listAlerts({ market }), listTrades(userId, market)]);
  const alerts = allAlerts.filter((a) => inRange(a.week_ending, timeFrame.fromDate, timeFrame.toDate));

  // Resolve every alert's symbol, then fetch all quotes in one batched
  // call and all history lookups in parallel - with a real provider
  // (Kite/Yahoo), doing this one ticker at a time for a whole shortlist
  // (easily dozens of triggered stocks) made the Performance page
  // painfully slow (each step is a network round trip).
  const symbolByTicker = new Map<string, string | null>();
  await Promise.all(
    Array.from(new Set(alerts.map((a) => a.ticker))).map(async (ticker) => {
      const mapping = await getSymbolMapping(market, ticker);
      symbolByTicker.set(
        ticker,
        mapping?.status === "mapped" ? (market === "IN" ? mapping.kite_symbol : mapping.yahoo_symbol) : null,
      );
    }),
  );
  const knownSymbols = Array.from(new Set(Array.from(symbolByTicker.values()).filter((s): s is string => s !== null)));
  const quotes = await getCachedQuotes(market, knownSymbols);

  const rows: ShortlistRow[] = await Promise.all(
    alerts.map(async (alert) => {
      const symbol = symbolByTicker.get(alert.ticker) ?? null;

      let currentPrice: number | null = null;
      let returnSinceTriggerPct: number | null = null;
      let maxGainSinceTriggerPct: number | null = null;
      let maxDrawdownSinceTriggerPct: number | null = null;

      if (symbol) {
        currentPrice = quotes.get(symbol)?.price ?? null;
        const history = await getDailyHistoryWithBackfill(market, alert.ticker, symbol, alert.week_ending, timeFrame.toDate);
        if (currentPrice !== null) {
          returnSinceTriggerPct = ((currentPrice - alert.trigger_price) / alert.trigger_price) * 100;
        }
        if (history.length > 0) {
          const maxClose = Math.max(...history.map((h) => h.close));
          const minClose = Math.min(...history.map((h) => h.close));
          maxGainSinceTriggerPct = ((maxClose - alert.trigger_price) / alert.trigger_price) * 100;
          maxDrawdownSinceTriggerPct = ((minClose - alert.trigger_price) / alert.trigger_price) * 100;
        }
      }

      const bought: ShortlistRow["bought"] = trades.some((t) => t.ticker === alert.ticker) ? "yes" : "skipped";
      return { alert, currentPrice, returnSinceTriggerPct, maxGainSinceTriggerPct, maxDrawdownSinceTriggerPct, bought };
    }),
  );

  function avg(values: Array<number | null>): number | null {
    const known = values.filter((v): v is number => v !== null);
    return known.length > 0 ? known.reduce((s, v) => s + v, 0) / known.length : null;
  }

  const byGrade = (grade: "A" | "B" | "C") =>
    avg(rows.filter((r) => r.alert.grade === grade).map((r) => r.returnSinceTriggerPct));

  const sorted = [...rows].filter((r) => r.returnSinceTriggerPct !== null).sort(
    (a, b) => (b.returnSinceTriggerPct as number) - (a.returnSinceTriggerPct as number),
  );

  return {
    rows,
    avgReturnPct: avg(rows.map((r) => r.returnSinceTriggerPct)),
    pctInProfit:
      rows.filter((r) => r.returnSinceTriggerPct !== null).length > 0
        ? (rows.filter((r) => (r.returnSinceTriggerPct ?? -1) > 0).length /
            rows.filter((r) => r.returnSinceTriggerPct !== null).length) *
          100
        : null,
    avgByGrade: { A: byGrade("A"), B: byGrade("B"), C: byGrade("C") },
    avgBreakoutPct: avg(rows.filter((r) => r.alert.signal_type === "breakout").map((r) => r.returnSinceTriggerPct)),
    avgPullbackPct: avg(rows.filter((r) => r.alert.signal_type === "pullback").map((r) => r.returnSinceTriggerPct)),
    avgBoughtPct: avg(rows.filter((r) => r.bought === "yes").map((r) => r.returnSinceTriggerPct)),
    avgSkippedPct: avg(rows.filter((r) => r.bought === "skipped").map((r) => r.returnSinceTriggerPct)),
    top10: sorted.slice(0, 10),
    bottom10: sorted.slice(-10).reverse(),
  };
}

export function addDaysIso(dateIso: string, days: number): string {
  return format(addDays(new Date(`${dateIso}T00:00:00Z`), days), "yyyy-MM-dd");
}

export function subDaysIso(dateIso: string, days: number): string {
  return format(subDays(new Date(`${dateIso}T00:00:00Z`), days), "yyyy-MM-dd");
}

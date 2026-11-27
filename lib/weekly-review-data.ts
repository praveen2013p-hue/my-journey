/**
 * Server-side data assembly for the Weekly Review page (BRIEF.md §7.5):
 * "Auto-generated page per week... Deterministic summaries only (no AI
 * calls)." Everything here is a plain aggregation of data already stored
 * by the webhook and the Journal - no judgment calls, no generated text
 * beyond simple templated sentences built in the page component.
 */

import { addDays, format, subDays } from "date-fns";
import { listAlerts } from "./db/alerts";
import { getWeeklyReflection } from "./db/weekly-reflections";
import { getLatestSectorMetricsWeekAtOrBefore, listSectorMetricsForWeek } from "./db/sectors";
import { listTrades } from "./db/trades";
import type { Grade, Market, TradeRow } from "./db/schema-types";
import { closedTradePnl, computeTradeStats } from "./trade-stats";

export interface WeeklyTriggerCounts {
  breakout: Record<Grade, number>;
  pullback: number;
}

export interface FocusSectorChange {
  market: Market;
  sector: string;
  status: "new" | "continuing" | "dropped";
}

export interface WeeklyReviewData {
  weekEnding: string | null;
  weekStart: string | null;
  prevWeek: string;
  nextWeek: string;
  triggersByMarket: Record<Market, WeeklyTriggerCounts>;
  focusSectorChanges: FocusSectorChange[];
  tradesOpened: TradeRow[];
  tradesClosed: TradeRow[];
  winRateThisWeek: number | null;
  realizedPnlByMarket: Record<Market, number>;
  reflection: string;
  /** Ticker -> exchange, from every alert ever seen (BRIEF.md §14.1 - never guess the exchange for a TradingView link). */
  exchangeByTicker: Record<string, string>;
}

function emptyTriggerCounts(): Record<Market, WeeklyTriggerCounts> {
  return {
    IN: { breakout: { A: 0, B: 0, C: 0 }, pullback: 0 },
    US: { breakout: { A: 0, B: 0, C: 0 }, pullback: 0 },
  };
}

async function resolveWeekEnding(requested?: string): Promise<string | null> {
  if (requested) return requested;
  const all = await listAlerts({});
  if (all.length === 0) return null;
  return all.reduce((latest, a) => (a.week_ending > latest ? a.week_ending : latest), all[0].week_ending);
}

async function focusSectorChangesForMarket(market: Market, weekEnding: string, prevWeekEnding: string) {
  // Tolerant "at or before" lookup, not an exact-week match - if the prior
  // week's sector_metrics computation didn't run (a one-off outage), this
  // falls back to the most recent week that DID compute, rather than
  // treating it as "no previous data" and mislabeling every continuing
  // focus sector as "new."
  const tolerantPrevWeek = await getLatestSectorMetricsWeekAtOrBefore(market, prevWeekEnding);
  const [current, previous] = await Promise.all([
    listSectorMetricsForWeek(market, weekEnding),
    tolerantPrevWeek ? listSectorMetricsForWeek(market, tolerantPrevWeek) : Promise.resolve([]),
  ]);
  const currentFocus = new Set(current.filter((m) => m.is_focus).map((m) => m.sector));
  const previousFocus = new Set(previous.filter((m) => m.is_focus).map((m) => m.sector));

  const changes: FocusSectorChange[] = [];
  for (const sector of currentFocus) {
    changes.push({ market, sector, status: previousFocus.has(sector) ? "continuing" : "new" });
  }
  for (const sector of previousFocus) {
    if (!currentFocus.has(sector)) changes.push({ market, sector, status: "dropped" });
  }
  return changes.sort((a, b) => a.sector.localeCompare(b.sector));
}

export async function getWeeklyReviewData(userId: string, requestedWeek?: string): Promise<WeeklyReviewData> {
  const weekEnding = await resolveWeekEnding(requestedWeek);
  const allAlerts = await listAlerts({});
  const exchangeByTicker: Record<string, string> = {};
  for (const a of allAlerts) exchangeByTicker[a.ticker] = a.exchange;

  const triggersByMarket = emptyTriggerCounts();
  let focusSectorChanges: FocusSectorChange[] = [];
  const tradesOpened: TradeRow[] = [];
  const tradesClosed: TradeRow[] = [];
  const realizedPnlByMarket: Record<Market, number> = { IN: 0, US: 0 };
  let winRateThisWeek: number | null = null;
  let weekStart: string | null = null;

  if (weekEnding) {
    const [y, m, d] = weekEnding.split("-").map(Number);
    const endAnchor = new Date(Date.UTC(y, m - 1, d));
    weekStart = format(subDays(endAnchor, 6), "yyyy-MM-dd");
    const prevWeekEnding = format(subDays(endAnchor, 7), "yyyy-MM-dd");

    const weekAlerts = allAlerts.filter((a) => a.week_ending === weekEnding);
    for (const alert of weekAlerts) {
      if (alert.signal_type === "breakout") triggersByMarket[alert.market].breakout[alert.grade] += 1;
      else triggersByMarket[alert.market].pullback += 1;
    }

    const [focusIn, focusUs, tradesIn, tradesUs] = await Promise.all([
      focusSectorChangesForMarket("IN", weekEnding, prevWeekEnding),
      focusSectorChangesForMarket("US", weekEnding, prevWeekEnding),
      listTrades(userId, "IN"),
      listTrades(userId, "US"),
    ]);
    focusSectorChanges = [...focusIn, ...focusUs];

    const allTrades = [...tradesIn, ...tradesUs];
    const closedThisWeek = [];
    for (const trade of allTrades) {
      if (trade.buy_date >= weekStart && trade.buy_date <= weekEnding) tradesOpened.push(trade);
      if (trade.sell_date && trade.sell_date >= weekStart && trade.sell_date <= weekEnding) {
        tradesClosed.push(trade);
        const closed = closedTradePnl(trade)!;
        closedThisWeek.push(closed);
        realizedPnlByMarket[trade.market] += closed.pnlAbs;
      }
    }
    winRateThisWeek = computeTradeStats(closedThisWeek).winRate;
  }

  const base = weekEnding ?? format(new Date(), "yyyy-MM-dd");
  const [y, m, d] = base.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));

  return {
    weekEnding,
    weekStart,
    prevWeek: format(addDays(anchor, -7), "yyyy-MM-dd"),
    nextWeek: format(addDays(anchor, 7), "yyyy-MM-dd"),
    triggersByMarket,
    focusSectorChanges,
    tradesOpened,
    tradesClosed,
    winRateThisWeek,
    realizedPnlByMarket,
    reflection: weekEnding ? await getWeeklyReflection(userId, weekEnding) : "",
    exchangeByTicker,
  };
}

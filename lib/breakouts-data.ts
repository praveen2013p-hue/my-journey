/**
 * Server-side data assembly for the Breakouts/Pullbacks page (BRIEF.md
 * §7.1 - "two tabs, same component"). Keeps the page component itself
 * thin: this does the filtering, the pullback-only breakout lookup, the
 * tab badge counts, and the "New since last visit" bookkeeping.
 */

import { addDays, format } from "date-fns";
import { countAlertsCreatedAfter, getLatestWeekEnding, listAlerts } from "./db/alerts";
import { bumpLastSeenAlerts } from "./db/settings";
import type {
  AlertRow,
  Grade,
  Market,
  SignalType,
  SymbolMapRow,
} from "./db/schema-types";
import { listSymbolMappingsForTickers } from "./db/symbol-map";

export interface BreakoutsFilters {
  week?: string;
  dateFrom?: string;
  dateTo?: string;
  market?: string;
  grades?: string;
  sector?: string;
  industry?: string;
  search?: string;
}

export interface BreakoutRow {
  id: string;
  market: Market;
  exchange: string;
  ticker: string;
  providerSymbol: string | null;
  grade: Grade;
  weekEnding: string;
  triggerPrice: number;
  breakoutLevel: number | null;
  volume: number | null;
  avgVolume4w: number | null;
  volRatio: number | null;
  mrs: number | null;
  pctAboveMa: number | null;
  overheadPct: number | null;
  ma30w: number | null;
  sector: string | null;
  industry: string | null;
  qualityScore: number | null;
  qualityBreakdown: Record<string, unknown> | null;
  fundamentals: Record<string, unknown> | null;
  isNew: boolean;
  originalBreakoutDate: string | null;
  originalGrade: Grade | null;
  weeksSinceBreakout: number | null;
}

export interface BreakoutsPageData {
  weekEnding: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  rangeMode: boolean;
  prevWeek: string;
  nextWeek: string;
  market: "ALL" | Market;
  grades: Grade[];
  sector: string;
  industry: string;
  search: string;
  rows: BreakoutRow[];
  availableSectors: string[];
  availableIndustries: string[];
  tabCounts: Record<SignalType, Record<Market, number>>;
  newSinceLastVisit: number;
}

const ALL_GRADES: Grade[] = ["A", "B", "C"];

async function weekEndingPlusDays(week: string, days: number): Promise<string> {
  const [y, m, d] = week.split("-").map(Number);
  return format(addDays(new Date(Date.UTC(y, m - 1, d)), days), "yyyy-MM-dd");
}

function asMarketFilter(value: string | undefined): "ALL" | Market {
  return value === "IN" || value === "US" ? value : "ALL";
}

function asGrades(value: string | undefined): Grade[] {
  if (!value) return ALL_GRADES;
  const parsed = value
    .split(",")
    .map((g) => g.trim().toUpperCase())
    .filter((g): g is Grade => g === "A" || g === "B" || g === "C");
  return parsed.length > 0 ? parsed : ALL_GRADES;
}

/** The most recent breakout at or before `beforeWeekEnding` for one ticker, from an already-fetched in-memory list (no DB call per row). */
function latestBreakoutFrom(
  breakoutsForMarket: AlertRow[],
  ticker: string,
  beforeWeekEnding: string,
): AlertRow | null {
  const matches = breakoutsForMarket
    .filter((r) => r.ticker === ticker && r.week_ending <= beforeWeekEnding)
    .sort((a, b) => (a.week_ending < b.week_ending ? 1 : -1));
  return matches[0] ?? null;
}

function buildRow(
  alert: AlertRow,
  previousCutoff: string | null,
  symbolMappings: Map<string, SymbolMapRow>,
  breakoutsByMarket: Map<Market, AlertRow[]>,
  signalType: SignalType,
): BreakoutRow {
  const mapping = symbolMappings.get(`${alert.market}:${alert.ticker}`);
  const avgVolume4w =
    alert.volume !== null && alert.vol_ratio ? alert.volume / alert.vol_ratio : null;

  let originalBreakoutDate: string | null = null;
  let originalGrade: Grade | null = null;
  let weeksSinceBreakout: number | null = null;

  if (signalType === "pullback") {
    const original = latestBreakoutFrom(breakoutsByMarket.get(alert.market) ?? [], alert.ticker, alert.week_ending);
    if (original) {
      originalBreakoutDate = original.week_ending;
      originalGrade = original.grade;
      const weeks =
        (new Date(alert.week_ending).getTime() - new Date(original.week_ending).getTime()) /
        (7 * 24 * 60 * 60 * 1000);
      weeksSinceBreakout = Math.round(weeks);
    }
  }

  return {
    id: alert.id,
    market: alert.market,
    exchange: alert.exchange,
    ticker: alert.ticker,
    providerSymbol: mapping?.status === "mapped" ? (alert.market === "IN" ? mapping.kite_symbol : mapping.yahoo_symbol) : null,
    grade: alert.grade,
    weekEnding: alert.week_ending,
    triggerPrice: alert.trigger_price,
    breakoutLevel: alert.breakout_level,
    volume: alert.volume,
    avgVolume4w,
    volRatio: alert.vol_ratio,
    mrs: alert.mrs,
    pctAboveMa: alert.pct_above_ma,
    overheadPct: alert.overhead_pct,
    ma30w: alert.ma30w,
    sector: alert.sector,
    industry: alert.industry,
    qualityScore: alert.quality_score,
    qualityBreakdown: alert.quality_breakdown,
    fundamentals: alert.fundamentals,
    isNew: previousCutoff !== null && alert.created_at > previousCutoff,
    originalBreakoutDate,
    originalGrade,
    weeksSinceBreakout,
  };
}

export async function getBreakoutsPageData(
  userId: string,
  signalType: SignalType,
  filters: BreakoutsFilters,
): Promise<BreakoutsPageData> {
  const rangeMode = Boolean(filters.dateFrom && filters.dateTo);
  const market = asMarketFilter(filters.market);
  const grades = asGrades(filters.grades);
  const sector = filters.sector ?? "";
  const industry = filters.industry ?? "";
  const search = filters.search ?? "";

  let weekEnding: string | null = null;
  if (!rangeMode) {
    weekEnding = filters.week ?? (await getLatestWeekEnding(signalType));
    if (!weekEnding) weekEnding = (await getLatestWeekEnding()) ?? format(new Date(), "yyyy-MM-dd");
  }

  // Previous cutoff is read then advanced exactly once per page view
  // (BRIEF.md §7.1: "clear after you view the list").
  const previousCutoff = await bumpLastSeenAlerts(userId);

  const baseFilters = rangeMode
    ? { signalType, dateFrom: filters.dateFrom, dateTo: filters.dateTo }
    : { signalType, weekEnding: weekEnding! };

  const filteredAlerts = await listAlerts({
    ...baseFilters,
    market,
    grades,
    sector: sector || undefined,
    industry: industry || undefined,
    search: search || undefined,
  });

  // Batch what buildRow used to fetch per-row: one symbol-mapping query per
  // market instead of one per alert, and (pullbacks only) the breakout
  // alerts needed for "original breakout" fetched once per market instead
  // of once per pullback row.
  const marketsOnPage = Array.from(new Set(filteredAlerts.map((a) => a.market)));
  const symbolMappings = new Map<string, SymbolMapRow>();
  await Promise.all(
    marketsOnPage.map(async (m) => {
      const tickers = filteredAlerts.filter((a) => a.market === m).map((a) => a.ticker);
      const mapped = await listSymbolMappingsForTickers(m, tickers);
      for (const [ticker, row] of mapped) symbolMappings.set(`${m}:${ticker}`, row);
    }),
  );

  const breakoutsByMarket = new Map<Market, AlertRow[]>();
  if (signalType === "pullback") {
    await Promise.all(
      marketsOnPage.map(async (m) => {
        breakoutsByMarket.set(m, await listAlerts({ market: m, signalType: "breakout" }));
      }),
    );
  }

  const rows = filteredAlerts.map((a) => buildRow(a, previousCutoff, symbolMappings, breakoutsByMarket, signalType));

  // Sector/industry dropdown options come from the unfiltered set for this
  // date window, so picking one doesn't hide the others from the list.
  const unfilteredForWindow = await listAlerts(baseFilters);
  const availableSectors = Array.from(
    new Set(unfilteredForWindow.map((a) => a.sector).filter((s): s is string => Boolean(s))),
  ).sort();
  const availableIndustries = Array.from(
    new Set(unfilteredForWindow.map((a) => a.industry).filter((s): s is string => Boolean(s))),
  ).sort();

  const tabCounts: Record<SignalType, Record<Market, number>> = {
    breakout: { IN: 0, US: 0 },
    pullback: { IN: 0, US: 0 },
  };
  const windowFilters = rangeMode
    ? { dateFrom: filters.dateFrom, dateTo: filters.dateTo }
    : { weekEnding: weekEnding! };
  const bothSignalTypes = await listAlerts(windowFilters);
  for (const a of bothSignalTypes) {
    tabCounts[a.signal_type][a.market] += 1;
  }

  const newSinceLastVisit = previousCutoff === null ? 0 : await countAlertsCreatedAfter(previousCutoff);

  return {
    weekEnding,
    dateFrom: filters.dateFrom ?? null,
    dateTo: filters.dateTo ?? null,
    rangeMode,
    prevWeek: weekEnding ? await weekEndingPlusDays(weekEnding, -7) : "",
    nextWeek: weekEnding ? await weekEndingPlusDays(weekEnding, 7) : "",
    market,
    grades,
    sector,
    industry,
    search,
    rows,
    availableSectors,
    availableIndustries,
    tabCounts,
    newSinceLastVisit,
  };
}

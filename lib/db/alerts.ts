/**
 * Repository for `alerts_raw` and `alerts`. Every function branches on
 * `isSupabaseConfigured()` (DECISIONS.md) — callers never see which
 * backend answered.
 */

import { computeQualityScore } from "../quality";
import { getSectorContextsForTicker } from "../sector-context";
import { approxMa30w } from "../weinstein";
import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, nextSeq, readStore } from "./local-store";
import type {
  AlertRow,
  Grade,
  Market,
  SignalType,
} from "./schema-types";

export interface AlertFundamentals {
  marketCap: number | null;
  pe: number | null;
  epsTtm: number | null;
  epsGrowthYoY: number | null;
  epsGrowthQoQ: number | null;
  salesGrowthYoY: number | null;
  salesGrowthQoQ: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  nextEarningsDate: string | null;
}

export interface UpsertAlertInput {
  market: Market;
  exchange: string;
  ticker: string;
  signal_type: SignalType;
  grade: Grade;
  week_ending: string; // yyyy-mm-dd
  triggered_at: string; // ISO
  trigger_price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  breakout_level: number | null;
  vol_ratio: number | null;
  mrs: number | null;
  pct_above_ma: number | null;
  overhead_pct: number | null;
  sector: string | null;
  industry: string | null;
  fundamentals: AlertFundamentals | null;
  raw: Record<string, unknown>;
}

export interface UpsertAlertResult {
  row: AlertRow;
  /** False the first time this (market, ticker, signal_type, week_ending) is seen. */
  wasUpdate: boolean;
}

function toQualityFundamentals(fundamentals: AlertFundamentals | null) {
  return fundamentals
    ? {
        salesGrowthYoY: fundamentals.salesGrowthYoY,
        epsGrowthYoY: fundamentals.epsGrowthYoY,
        roe: fundamentals.roe,
        debtToEquity: fundamentals.debtToEquity,
      }
    : null;
}

async function buildComputedFields(input: UpsertAlertInput) {
  const ma30w = approxMa30w(input.trigger_price, input.pct_above_ma);
  // Known to belong to a sector but its Stage/RS not known for this exact
  // week yet (sector board hasn't fired), or no sector_constituents
  // uploaded at all - either way computeQualityScore treats it as missing,
  // never guessed (BRIEF.md §9).
  const sectors = await getSectorContextsForTicker(input.market, input.ticker, input.week_ending);
  const quality = computeQualityScore({
    grade: input.grade,
    volRatio: input.vol_ratio,
    mrs: input.mrs,
    overheadPct: input.overhead_pct,
    sectors,
    fundamentals: toQualityFundamentals(input.fundamentals),
  });
  return { ma30w, quality };
}

export async function insertAlertRaw(
  body: Record<string, unknown>,
  accepted: boolean,
  reason: string | null,
): Promise<number> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("alerts_raw")
      .insert({ body, accepted, reason })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as number;
  }

  return mutateStore((store) => {
    const id = nextSeq(store, "alerts_raw");
    store.alerts_raw.push({
      id,
      received_at: new Date().toISOString(),
      body,
      accepted,
      reason,
      processed_at: null,
    });
    return id;
  });
}

/** Records that a (secret-valid) raw alert finished its deferred processing. */
export async function markAlertRawProcessed(
  id: number,
  reason: string | null,
): Promise<void> {
  const processed_at = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("alerts_raw").update({ processed_at, reason }).eq("id", id);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    const row = store.alerts_raw.find((r) => r.id === id);
    if (row) {
      row.processed_at = processed_at;
      row.reason = reason;
    }
  });
}

export async function upsertAlert(
  input: UpsertAlertInput,
): Promise<UpsertAlertResult> {
  const { ma30w, quality } = await buildComputedFields(input);
  const nowIso = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data: existing, error: lookupError } = await supabase
      .from("alerts")
      .select("id")
      .eq("market", input.market)
      .eq("ticker", input.ticker)
      .eq("signal_type", input.signal_type)
      .eq("week_ending", input.week_ending)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const payload = {
      market: input.market,
      exchange: input.exchange,
      ticker: input.ticker,
      signal_type: input.signal_type,
      grade: input.grade,
      week_ending: input.week_ending,
      triggered_at: input.triggered_at,
      trigger_price: input.trigger_price,
      open: input.open,
      high: input.high,
      low: input.low,
      volume: input.volume,
      breakout_level: input.breakout_level,
      vol_ratio: input.vol_ratio,
      mrs: input.mrs,
      pct_above_ma: input.pct_above_ma,
      overhead_pct: input.overhead_pct,
      sector: input.sector,
      industry: input.industry,
      fundamentals: input.fundamentals as unknown as Record<string, unknown> | null,
      ma30w,
      quality_score: quality.score,
      quality_breakdown: quality.breakdown as unknown as Record<string, unknown>,
      raw: input.raw,
      updated_at: nowIso,
    };

    const { data, error } = existing
      ? await supabase
          .from("alerts")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single()
      : await supabase
          .from("alerts")
          .insert({ ...payload, created_at: nowIso })
          .select()
          .single();
    if (error) throw error;
    return { row: data as AlertRow, wasUpdate: Boolean(existing) };
  }

  return mutateStore((store) => {
    const existingIndex = store.alerts.findIndex(
      (a) =>
        a.market === input.market &&
        a.ticker === input.ticker &&
        a.signal_type === input.signal_type &&
        a.week_ending === input.week_ending,
    );

    const row: AlertRow = {
      id: existingIndex >= 0 ? store.alerts[existingIndex].id : crypto.randomUUID(),
      market: input.market,
      exchange: input.exchange,
      ticker: input.ticker,
      signal_type: input.signal_type,
      grade: input.grade,
      week_ending: input.week_ending,
      triggered_at: input.triggered_at,
      trigger_price: input.trigger_price,
      open: input.open,
      high: input.high,
      low: input.low,
      volume: input.volume,
      breakout_level: input.breakout_level,
      vol_ratio: input.vol_ratio,
      mrs: input.mrs,
      pct_above_ma: input.pct_above_ma,
      overhead_pct: input.overhead_pct,
      sector: input.sector,
      industry: input.industry,
      fundamentals: input.fundamentals as unknown as Record<string, unknown> | null,
      ma30w,
      quality_score: quality.score,
      quality_breakdown: quality.breakdown as unknown as Record<string, unknown>,
      adjustment_factor:
        existingIndex >= 0 ? store.alerts[existingIndex].adjustment_factor : 1,
      needs_adjustment_review:
        existingIndex >= 0
          ? store.alerts[existingIndex].needs_adjustment_review
          : false,
      raw: input.raw,
      created_at: existingIndex >= 0 ? store.alerts[existingIndex].created_at : nowIso,
      updated_at: nowIso,
    };

    if (existingIndex >= 0) {
      store.alerts[existingIndex] = row;
      return { row, wasUpdate: true };
    }
    store.alerts.push(row);
    return { row, wasUpdate: false };
  });
}

export interface ListAlertsFilters {
  signalType?: SignalType;
  market?: Market | "ALL";
  weekEnding?: string;
  dateFrom?: string;
  dateTo?: string;
  grades?: Grade[];
  sector?: string;
  industry?: string;
  search?: string;
}

export async function listAlerts(
  filters: ListAlertsFilters = {},
): Promise<AlertRow[]> {
  let rows: AlertRow[];

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    let query = supabase.from("alerts").select("*");
    if (filters.signalType) query = query.eq("signal_type", filters.signalType);
    if (filters.market && filters.market !== "ALL") query = query.eq("market", filters.market);
    if (filters.weekEnding) query = query.eq("week_ending", filters.weekEnding);
    if (filters.dateFrom) query = query.gte("week_ending", filters.dateFrom);
    if (filters.dateTo) query = query.lte("week_ending", filters.dateTo);
    if (filters.grades && filters.grades.length > 0) query = query.in("grade", filters.grades);
    if (filters.sector) query = query.eq("sector", filters.sector);
    if (filters.industry) query = query.eq("industry", filters.industry);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    rows = data as AlertRow[];
  } else {
    const store = await readStore();
    rows = store.alerts;
  }

  return rows.filter((row) => {
    if (filters.signalType && row.signal_type !== filters.signalType) return false;
    if (filters.market && filters.market !== "ALL" && row.market !== filters.market) return false;
    if (filters.weekEnding && row.week_ending !== filters.weekEnding) return false;
    if (filters.dateFrom && row.week_ending < filters.dateFrom) return false;
    if (filters.dateTo && row.week_ending > filters.dateTo) return false;
    if (filters.grades && filters.grades.length > 0 && !filters.grades.includes(row.grade)) return false;
    if (filters.sector && row.sector !== filters.sector) return false;
    if (filters.industry && row.industry !== filters.industry) return false;
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      if (!row.ticker.toLowerCase().includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Latest `week_ending` among alerts matching the given signal type, or
 * null if none exist. A narrow `ORDER BY week_ending DESC LIMIT 1` -
 * deliberately NOT `listAlerts(...)` + reduce, which used to fetch every
 * matching row (all columns, including the heavy `raw`/`fundamentals`/
 * `quality_breakdown` JSON blobs) just to find one value. Called on every
 * Breakouts/Pullbacks/Dashboard page view, so this was a real cost.
 */
export async function getLatestWeekEnding(
  signalType?: SignalType,
): Promise<string | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    let query = supabase.from("alerts").select("week_ending");
    if (signalType) query = query.eq("signal_type", signalType);
    const { data, error } = await query.order("week_ending", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return (data as { week_ending: string } | null)?.week_ending ?? null;
  }

  const store = await readStore();
  const rows = signalType ? store.alerts.filter((a) => a.signal_type === signalType) : store.alerts;
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) => (row.week_ending > latest ? row.week_ending : latest), rows[0].week_ending);
}

/**
 * How many alerts were created after `sinceIso`, for the "N new since
 * your last visit" badge (BRIEF.md §7.1) - a `COUNT`, not a fetch of
 * every alert ever stored just to `.filter().length` it client-side.
 */
export async function countAlertsCreatedAfter(sinceIso: string): Promise<number> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { count, error } = await supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .gt("created_at", sinceIso);
    if (error) throw error;
    return count ?? 0;
  }
  const store = await readStore();
  return store.alerts.filter((a) => a.created_at > sinceIso).length;
}

/**
 * Each ticker's most recent `mrs` (Mansfield RS), across both signal
 * types, as of its latest alert - one batched query for every ticker
 * asked about, not one per ticker (same N+1 lesson as elsewhere in this
 * file). A ticker that's never triggered an alert is simply absent from
 * the returned map, never guessed at.
 */
export async function getLatestMrsForTickers(
  market: Market,
  tickers: string[],
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (tickers.length === 0) return result;
  const wanted = new Set(tickers);

  let candidates: Array<{ ticker: string; mrs: number | null; triggered_at: string }>;
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("alerts")
      .select("ticker, mrs, triggered_at")
      .eq("market", market)
      .in("ticker", tickers);
    if (error) throw error;
    candidates = data as typeof candidates;
  } else {
    const store = await readStore();
    candidates = store.alerts.filter((a) => a.market === market && wanted.has(a.ticker));
  }

  const latestAt = new Map<string, string>();
  for (const row of candidates) {
    const seenAt = latestAt.get(row.ticker);
    if (!seenAt || row.triggered_at > seenAt) {
      latestAt.set(row.ticker, row.triggered_at);
      result.set(row.ticker, row.mrs);
    }
  }
  return result;
}

/**
 * Every ticker's most recent `mrs`, for whichever tickers in this market
 * have ever triggered an alert - the universe the RS Rating percentile
 * (lib/rs-rating.ts) ranks against. Unlike `getLatestMrsForTickers`, this
 * isn't scoped to a given ticker list; a ticker whose latest mrs is null
 * is left out entirely (nothing to rank).
 */
export async function getLatestMrsForAllTickers(market: Market): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  let candidates: Array<{ ticker: string; mrs: number | null; triggered_at: string }>;
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("alerts").select("ticker, mrs, triggered_at").eq("market", market);
    if (error) throw error;
    candidates = data as typeof candidates;
  } else {
    const store = await readStore();
    candidates = store.alerts.filter((a) => a.market === market);
  }

  const latestAt = new Map<string, string>();
  const latestMrs = new Map<string, number | null>();
  for (const row of candidates) {
    const seenAt = latestAt.get(row.ticker);
    if (!seenAt || row.triggered_at > seenAt) {
      latestAt.set(row.ticker, row.triggered_at);
      latestMrs.set(row.ticker, row.mrs);
    }
  }
  for (const [ticker, mrs] of latestMrs) {
    if (mrs !== null) result.set(ticker, mrs);
  }
  return result;
}

/** Every requested alert, keyed by id - one batched fetch for the Quality Score calibration page instead of one getAlertById per closed trade. */
export async function getAlertsByIds(ids: string[]): Promise<Map<string, AlertRow>> {
  const result = new Map<string, AlertRow>();
  if (ids.length === 0) return result;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("alerts").select("*").in("id", ids);
    if (error) throw error;
    for (const row of data as AlertRow[]) result.set(row.id, row);
    return result;
  }

  const store = await readStore();
  const wanted = new Set(ids);
  for (const row of store.alerts) {
    if (wanted.has(row.id)) result.set(row.id, row);
  }
  return result;
}

export async function getAlertById(id: string): Promise<AlertRow | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("alerts").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as AlertRow) ?? null;
  }
  const store = await readStore();
  return store.alerts.find((a) => a.id === id) ?? null;
}

/** Find the most recent prior breakout for a ticker, used by pullback rows (BRIEF.md §5a). */
export async function findLatestBreakout(
  market: Market,
  ticker: string,
  beforeWeekEnding: string,
): Promise<AlertRow | null> {
  const rows = await listAlerts({ market, signalType: "breakout" });
  const matches = rows
    .filter((r) => r.ticker === ticker && r.week_ending <= beforeWeekEnding)
    .sort((a, b) => (a.week_ending < b.week_ending ? 1 : -1));
  return matches[0] ?? null;
}

export interface TickerSuggestion {
  ticker: string;
  market: Market;
  exchange: string;
  sector: string | null;
  industry: string | null;
}

/**
 * Live ticker-search suggestions (debounced on the client). Matches on
 * ticker first; the data model has no company-name field anywhere
 * (TradingView's alert payload only ever sends ticker/exchange/sector/
 * industry - DECISIONS.md), so sector/industry text is the closest
 * "descriptive" match available, not a real company name. Narrow select
 * (no `raw`/`fundamentals`/`quality_breakdown` blobs) and a small limit -
 * this runs on every keystroke (debounced), unlike `listAlerts`.
 */
export async function searchTickerSuggestions(
  market: Market | "ALL",
  query: string,
  limit = 8,
): Promise<TickerSuggestion[]> {
  const needle = query.trim().toUpperCase();
  if (!needle) return [];

  let candidates: Array<Pick<AlertRow, "ticker" | "market" | "exchange" | "sector" | "industry">>;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    let dbQuery = supabase
      .from("alerts")
      .select("ticker, market, exchange, sector, industry")
      .or(`ticker.ilike.%${needle}%,sector.ilike.%${needle}%,industry.ilike.%${needle}%`);
    if (market !== "ALL") dbQuery = dbQuery.eq("market", market);
    const { data, error } = await dbQuery.limit(200);
    if (error) throw error;
    candidates = data as typeof candidates;
  } else {
    const store = await readStore();
    candidates = store.alerts.filter(
      (a) =>
        (market === "ALL" || a.market === market) &&
        (a.ticker.toUpperCase().includes(needle) ||
          (a.sector ?? "").toUpperCase().includes(needle) ||
          (a.industry ?? "").toUpperCase().includes(needle)),
    );
  }

  const byTicker = new Map<string, TickerSuggestion>();
  for (const row of candidates) {
    const key = `${row.market}:${row.ticker}`;
    if (!byTicker.has(key)) {
      byTicker.set(key, { ticker: row.ticker, market: row.market, exchange: row.exchange, sector: row.sector, industry: row.industry });
    }
  }

  // Tickers that literally start with the query sort first - the common case of typing the real ticker.
  return Array.from(byTicker.values())
    .sort((a, b) => {
      const aStarts = a.ticker.toUpperCase().startsWith(needle);
      const bStarts = b.ticker.toUpperCase().startsWith(needle);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.ticker.localeCompare(b.ticker);
    })
    .slice(0, limit);
}

/** Latest time a secret-valid alert was received, for the data-freshness strip (BRIEF.md §14.2). */
export async function getLatestAcceptedRawReceivedAt(): Promise<string | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("alerts_raw")
      .select("received_at")
      .eq("accepted", true)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.received_at ?? null;
  }
  const store = await readStore();
  const accepted = store.alerts_raw.filter((r) => r.accepted);
  if (accepted.length === 0) return null;
  return accepted.reduce((latest, r) => (r.received_at > latest ? r.received_at : latest), accepted[0].received_at);
}

/** Every alerts_raw row received since `sinceIso`, for Settings -> "Alert health" (BRIEF.md §17.1). */
export async function listAlertsRawSince(
  sinceIso: string,
): Promise<Array<{ received_at: string; accepted: boolean }>> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("alerts_raw")
      .select("received_at, accepted")
      .gte("received_at", sinceIso);
    if (error) throw error;
    return data ?? [];
  }
  const store = await readStore();
  return store.alerts_raw
    .filter((r) => r.received_at >= sinceIso)
    .map((r) => ({ received_at: r.received_at, accepted: r.accepted }));
}

async function updateAlertQuality(
  id: string,
  qualityScore: number,
  qualityBreakdown: Record<string, unknown>,
): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("alerts")
      .update({ quality_score: qualityScore, quality_breakdown: qualityBreakdown, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    const row = store.alerts.find((a) => a.id === id);
    if (row) {
      row.quality_score = qualityScore;
      row.quality_breakdown = qualityBreakdown;
      row.updated_at = new Date().toISOString();
    }
  });
}

/**
 * Recomputes every alert's Quality Score for a market/week once new sector
 * data arrives (BRIEF.md §9: "recomputed when sector data... arrives").
 * Never touches grade, stage, or anything else TradingView already sent -
 * only the sector-strength bucket (and therefore the total) can change.
 */
export async function recomputeQualityForWeek(market: Market, weekEnding: string): Promise<void> {
  const rows = await listAlerts({ market, weekEnding });
  for (const row of rows) {
    const sectors = await getSectorContextsForTicker(market, row.ticker, row.week_ending);
    const quality = computeQualityScore({
      grade: row.grade,
      volRatio: row.vol_ratio,
      mrs: row.mrs,
      overheadPct: row.overhead_pct,
      sectors,
      fundamentals: toQualityFundamentals(row.fundamentals as AlertFundamentals | null),
    });
    await updateAlertQuality(row.id, quality.score, quality.breakdown as unknown as Record<string, unknown>);
  }
}

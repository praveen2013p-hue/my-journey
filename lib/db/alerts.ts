/**
 * Repository for `alerts_raw` and `alerts`. Every function branches on
 * `isSupabaseConfigured()` (DECISIONS.md) — callers never see which
 * backend answered.
 */

import { computeQualityScore } from "../quality";
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

function buildComputedFields(input: UpsertAlertInput) {
  const ma30w = approxMa30w(input.trigger_price, input.pct_above_ma);
  const quality = computeQualityScore({
    grade: input.grade,
    volRatio: input.vol_ratio,
    mrs: input.mrs,
    overheadPct: input.overhead_pct,
    // Sector context (focus star, stage) isn't wired up until Phase 2's
    // sector_constituents mapping exists; recomputed then (BRIEF.md §9).
    sectors: [],
    fundamentals: input.fundamentals
      ? {
          salesGrowthYoY: input.fundamentals.salesGrowthYoY,
          epsGrowthYoY: input.fundamentals.epsGrowthYoY,
          roe: input.fundamentals.roe,
          debtToEquity: input.fundamentals.debtToEquity,
        }
      : null,
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
  const { ma30w, quality } = buildComputedFields(input);
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

/** Latest `week_ending` among alerts matching the given signal type, or null if none exist. */
export async function getLatestWeekEnding(
  signalType?: SignalType,
): Promise<string | null> {
  const rows = await listAlerts(signalType ? { signalType } : {});
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) => (row.week_ending > latest ? row.week_ending : latest), rows[0].week_ending);
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

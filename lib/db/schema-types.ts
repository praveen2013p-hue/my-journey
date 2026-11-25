/**
 * Row types mirroring supabase/migrations/0001_init.sql exactly. Both the
 * local dev store and the real Supabase client return these same shapes, so
 * callers never know which backend answered them.
 */

export type Market = "IN" | "US";
export type SignalType = "breakout" | "pullback";
export type Grade = "A" | "B" | "C";
export type Stage = 1 | 2 | 3 | 4;
export type Theme = "dark" | "light";

export interface AppSettings {
  id: 1;
  site_name: string;
  bench_in: string;
  bench_in_sector: string;
  bench_us: string;
  bench_us_sector: string;
  updated_at: string;
}

export interface AlertRawRow {
  id: number;
  received_at: string;
  body: Record<string, unknown>;
  accepted: boolean;
  reason: string | null;
  processed_at: string | null;
}

export interface AlertRow {
  id: string;
  market: Market;
  exchange: string;
  ticker: string;
  signal_type: SignalType;
  grade: Grade;
  week_ending: string; // date, ISO yyyy-mm-dd
  triggered_at: string;
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
  fundamentals: Record<string, unknown> | null;
  ma30w: number | null;
  quality_score: number | null;
  quality_breakdown: Record<string, unknown> | null;
  adjustment_factor: number;
  needs_adjustment_review: boolean;
  raw: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SectorSnapshotRow {
  id: number;
  market: Market;
  week_ending: string;
  sector: string;
  stage: Stage | null;
  mrs: number | null;
  rs_up: boolean | null;
  vs_ma: number | null;
  chg4: number | null;
  focus: boolean;
  source: "alert" | "backfill";
  created_at: string;
}

export interface SectorMetricRow {
  id: number;
  market: Market;
  week_ending: string;
  sector: string;
  rank: number | null;
  mrs: number | null;
  d4: number | null;
  d13: number | null;
  d26: number | null;
  d52: number | null;
  traded_value: number | null;
  tv_avg10: number | null;
  tv_ratio: number | null;
  is_focus: boolean;
  price_chg_1w: number | null;
  rs_chg_1w: number | null;
  traded_value_chg_1w: number | null;
  rank_move_1w: number | null;
  created_at: string;
}

export interface SectorMapRow {
  id: number;
  market: Market;
  display_name: string;
  tv_symbol: string | null;
  provider_symbol: string | null;
  kind: "sector" | "industry";
}

export interface SectorConstituentRow {
  id: number;
  market: Market;
  sector: string;
  ticker: string;
  updated_at: string;
}

export interface SymbolMapRow {
  id: number;
  market: Market;
  tv_ticker: string;
  kite_symbol: string | null;
  yahoo_symbol: string | null;
  exchange: string | null;
  status: "mapped" | "unmapped";
  notes: string | null;
}

export interface ProviderSessionRow {
  id: number;
  provider: "zerodha";
  access_token_encrypted: string | null;
  expires_at: string | null;
  updated_at: string;
}

export interface QuoteRow {
  id: number;
  text: string;
  author: string | null;
  owner_id: string | null;
  active: boolean;
  created_at: string;
}

export interface BackupLogRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "success" | "failure" | null;
  detail: string | null;
}

export interface PriceHistoryRow {
  id: number;
  market: Market;
  ticker: string;
  date: string;
  close: number;
  adjustment_factor: number;
}

export interface HolidayRow {
  id: number;
  market: Market;
  holiday_date: string;
  description: string | null;
}

export interface AllowedUserRow {
  email: string;
}

export interface UserSettingsRow {
  user_id: string;
  theme: Theme;
  timezone: string;
  last_seen_alerts_at: string | null;
  /** No longer used by anything (Safe SWP switched to the classic 4% rule) - kept so an already-entered value isn't silently dropped. */
  birth_year: number | null;
  /** Sidebar label for the category grouping NPS and Mutual Funds - renameable, defaults to "My Long Term Holding". */
  nav_long_term_label: string;
  updated_at: string;
}

export interface StrategyTagRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface TradeRow {
  id: string;
  user_id: string;
  market: Market;
  ticker: string;
  buy_date: string;
  quantity: number;
  buy_price: number;
  sell_date: string | null;
  sell_price: number | null;
  strategy_tag_id: string | null;
  alert_id: string | null;
  /** Optional - the R-multiple risk management feature. Null means "no stop set," never a guess. */
  stop_loss: number | null;
  created_at: string;
}

/**
 * One month's manual mutual fund snapshot, per user - replaces the
 * Google Sheet the user used to keep (DECISIONS.md). One aggregate
 * portfolio number, not per-scheme - deliberately simple, matching how
 * the user described tracking it ("overall invested and current
 * amount"). `amount_added` is that month's fresh contribution (0 if
 * none); "total invested to date" is never stored, only derived by
 * summing every month's `amount_added` up to and including that month -
 * one fewer number to type and get wrong each month.
 */
/**
 * A family member's named portfolio within Mutual Funds (DECISIONS.md) -
 * "Self", or anything else the user types ("Wife", "Son", ...). Fully
 * open, no preset set. Every mutual_fund_entries row belongs to exactly
 * one profile.
 */
export interface MutualFundProfileRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface MutualFundEntryRow {
  id: string;
  user_id: string;
  profile_id: string;
  /** yyyy-mm-01 - always the first of the month; there's at most one entry per profile per month. */
  month: string;
  /** Always sip_amount + lumpsum_amount + stp_amount + other_amount (each defaulting to 0) - computed by the app, never typed directly. */
  amount_added: number;
  /** This month's SIP contribution - null means never classified (an entry from before the breakdown existed), not "zero". */
  sip_amount: number | null;
  /** This month's one-off lumpsum contribution - same null convention as sip_amount. */
  lumpsum_amount: number | null;
  /** This month's STP (systematic transfer plan) contribution - same null convention as sip_amount. */
  stp_amount: number | null;
  /** Anything that doesn't fit SIP/lumpsum/STP (or, for an entry predating the breakdown, its entire original amount_added) - same null convention as sip_amount. */
  other_amount: number | null;
  /** Any amount pulled out of the portfolio this month - reduces net invested, since it's money that's no longer in the fund. 0 if none. */
  withdrawal: number;
  /** What the user's own plan called for investing this month - optional, null if no plan was set for that month. Purely informational; never affects the invested/gain math. */
  planned_amount: number | null;
  current_value: number;
  notes: string | null;
  /** Why this month's amount_added is negative (a correction/reversal, say) - null unless amount_added < 0 and the user has explained it. */
  negative_amount_note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One month's manual NPS (National Pension System) snapshot, per user -
 * same structural pattern as `MutualFundEntryRow` (DECISIONS.md): one
 * aggregate portfolio number, not per-scheme. `amount_added` is always
 * `sip_amount + lumpsum_amount + stp_amount + other_amount`, computed by
 * the app, never typed directly.
 */
export interface NpsEntryRow {
  id: string;
  user_id: string;
  /** yyyy-mm-01 - always the first of the month; there's at most one entry per user per month. */
  month: string;
  amount_added: number;
  /** This month's SIP contribution - null means never classified (an entry from before the breakdown existed), not "zero". */
  sip_amount: number | null;
  /** This month's one-off lumpsum contribution - same null convention as sip_amount. */
  lumpsum_amount: number | null;
  /** This month's STP (systematic transfer plan) contribution - same null convention as sip_amount. */
  stp_amount: number | null;
  /** Anything that doesn't fit SIP/lumpsum/STP (or, for an entry predating the breakdown, its entire original amount_added) - same null convention as sip_amount. */
  other_amount: number | null;
  /** Any amount pulled out of the portfolio this month - reduces net invested, since it's money that's no longer in the fund. 0 if none. */
  withdrawal: number;
  /** What the user's own plan called for investing this month - optional, null if no plan was set for that month. Purely informational; never affects the invested/gain math. */
  planned_amount: number | null;
  current_value: number;
  notes: string | null;
  /** Why this month's amount_added is negative (a correction/reversal, say) - null unless amount_added < 0 and the user has explained it. */
  negative_amount_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockNoteRow {
  user_id: string;
  market: Market;
  ticker: string;
  note: string | null;
  updated_at: string;
}

export interface WeeklyReflectionRow {
  user_id: string;
  week_ending: string;
  text: string | null;
  updated_at: string;
}

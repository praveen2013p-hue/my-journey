/**
 * Weinstein stage analysis, matching the Pine scripts exactly (BRIEF.md §6).
 *
 * All series are weekly, oldest bar first, most recent bar last — the same
 * order Pine's `close[0]` (latest) / `close[n]` (n bars back) convention
 * maps to `series[series.length - 1 - n]`.
 *
 * Per BRIEF.md §17.4, TradingView is the source of truth for a stored
 * alert's grade/stage — these functions are only ever used to label the
 * site's own *indicative* numbers (e.g. mid-week), never to overwrite what
 * an alert already recorded.
 */

export type Stage = 1 | 2 | 3 | 4;

export const MA_PERIOD = 30;
export const SLOPE_LOOKBACK = 4;
export const SLOPE_RISING_THRESHOLD = 0.5;
export const SLOPE_FALLING_THRESHOLD = -0.5;
export const SIDEWAYS_LOOKBACK = 26;
export const MANSFIELD_RS_PERIOD = 52;

export interface StageResult {
  /** 30-week SMA at the latest bar, or null if there isn't enough history. */
  ma: number | null;
  /** (ma - ma 4 weeks ago) / ma 4 weeks ago * 100 */
  maSlopePct: number | null;
  rising: boolean;
  falling: boolean;
  stage: Stage | null;
}

/**
 * Simple moving average as a full series (same length as `values`).
 * `result[i]` is null until there are `period` values to average.
 */
export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Value `weeksAgo` bars behind the latest bar, or null if out of range. */
function barsAgo<T>(series: Array<T>, weeksAgo: number): T | undefined {
  const idx = series.length - 1 - weeksAgo;
  return idx >= 0 ? series[idx] : undefined;
}

/**
 * Classify the latest bar's Weinstein stage from a series of weekly closes.
 * Needs at least 30 bars for the MA itself; the sideways (stage 1 vs 3)
 * branch additionally needs 26 more bars of MA history, and is left as
 * `stage: null` until then rather than guessed.
 */
export function weinsteinStage(closes: number[]): StageResult {
  const empty: StageResult = {
    ma: null,
    maSlopePct: null,
    rising: false,
    falling: false,
    stage: null,
  };
  if (closes.length < MA_PERIOD) return empty;

  const maSeries = sma(closes, MA_PERIOD);
  const ma = barsAgo(maSeries, 0) ?? null;
  if (ma === null) return empty;

  const maLookback = barsAgo(maSeries, SLOPE_LOOKBACK) ?? null;
  const close = barsAgo(closes, 0) as number;

  let maSlopePct: number | null = null;
  let rising = false;
  let falling = false;
  if (maLookback !== null && maLookback !== 0) {
    maSlopePct = ((ma - maLookback) / maLookback) * 100;
    rising = maSlopePct > SLOPE_RISING_THRESHOLD;
    falling = maSlopePct < SLOPE_FALLING_THRESHOLD;
  }

  let stage: Stage | null = null;
  if (rising) {
    stage = close >= ma ? 2 : 3;
  } else if (falling) {
    stage = close <= ma ? 4 : 1;
  } else if (maSlopePct !== null) {
    const ma26 = barsAgo(maSeries, SIDEWAYS_LOOKBACK) ?? null;
    if (ma26 !== null) stage = ma > ma26 ? 3 : 1;
  }

  return { ma, maSlopePct, rising, falling, stage };
}

export interface MansfieldDelta {
  d4: number | null;
  d13: number | null;
  d26: number | null;
  d52: number | null;
}

export interface MansfieldResult {
  /** close / benchClose at the latest bar */
  rs: number | null;
  /** (rs / SMA(rs, 52) - 1) * 100 at the latest bar */
  mrs: number | null;
  /** mrs now minus mrs n weeks ago, for n = 4, 13, 26, 52 */
  delta: MansfieldDelta;
}

/**
 * Mansfield relative strength and its week-over-week deltas.
 * `closes` and `benchCloses` must be aligned (same week per index); only
 * the overlapping length is used.
 */
export function mansfieldRS(
  closes: number[],
  benchCloses: number[],
): MansfieldResult {
  const n = Math.min(closes.length, benchCloses.length);
  const empty: MansfieldResult = {
    rs: null,
    mrs: null,
    delta: { d4: null, d13: null, d26: null, d52: null },
  };
  if (n === 0) return empty;

  const rsSeries: number[] = [];
  for (let i = 0; i < n; i++) {
    const bench = benchCloses[i];
    rsSeries.push(bench ? closes[i] / bench : NaN);
  }
  const rsAverageSeries = sma(rsSeries, MANSFIELD_RS_PERIOD);
  const mrsSeries: Array<number | null> = rsSeries.map((rsValue, i) => {
    const base = rsAverageSeries[i];
    if (base === null || base === 0 || Number.isNaN(rsValue)) return null;
    return (rsValue / base - 1) * 100;
  });

  const rsLatest = rsSeries[n - 1];
  const rs = Number.isFinite(rsLatest) ? rsLatest : null;
  const mrs = mrsSeries[n - 1] ?? null;

  function deltaAt(weeksAgo: number): number | null {
    if (mrs === null) return null;
    const past = barsAgo(mrsSeries, weeksAgo);
    return past === null || past === undefined ? null : mrs - past;
  }

  return {
    rs,
    mrs,
    delta: {
      d4: deltaAt(4),
      d13: deltaAt(13),
      d26: deltaAt(26),
      d52: deltaAt(52),
    },
  };
}

/**
 * Fallback 30W MA when provider weekly history isn't available yet.
 * Derived from the alert payload's own `pctAboveMA`, per BRIEF.md §7.1.
 * Callers must label the result "approx".
 */
export function approxMa30w(
  triggerPrice: number,
  pctAboveMA: number | null,
): number | null {
  if (pctAboveMA === null) return null;
  const divisor = 1 + pctAboveMA / 100;
  if (divisor === 0) return null;
  return triggerPrice / divisor;
}

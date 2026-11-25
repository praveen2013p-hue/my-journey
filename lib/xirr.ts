/**
 * XIRR (Extended Internal Rate of Return) - the standard way to measure
 * returns on irregular, unevenly-timed cash flows (SIP-style
 * contributions, withdrawals, and a terminal "if I sold today" value),
 * same convention Excel/Google Sheets' XIRR and SEBI-mandated mutual
 * fund return disclosures use: Actual/365 day-count, solved numerically
 * (there's no closed-form solution). Pure math, no I/O, no Date object -
 * day counts come from `daysSinceEpoch` below, which only ever
 * subtracts two `Date.UTC(...)` millisecond values (never reads one back
 * through a local getter), so it can't hit the timezone bug documented
 * in lib/mutual-fund-stats.ts.
 */

export interface CashFlow {
  /** Days since the Unix epoch (UTC) - from `daysSinceEpoch`. */
  days: number;
  /** Negative = money leaving the investor's pocket (a contribution); positive = money coming back (a withdrawal, or the terminal value). */
  amount: number;
}

/** "yyyy-mm-01" -> days since the Unix epoch, UTC - pure arithmetic on Date.UTC's millisecond return value, never a getter. */
export function daysSinceEpoch(month: string): number {
  const year = Number(month.slice(0, 4));
  const zeroBasedMonth = Number(month.slice(5, 7)) - 1;
  const day = Number(month.slice(8, 10)) || 1;
  return Date.UTC(year, zeroBasedMonth, day) / 86_400_000;
}

function netPresentValue(rate: number, flows: CashFlow[]): number {
  const t0 = flows[0].days;
  return flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, (f.days - t0) / 365), 0);
}

/**
 * Solves for the annualized rate via bisection (robust and simple to
 * reason about for a from-scratch implementation, unlike Newton-Raphson
 * which can diverge for some cash-flow shapes). Returns null when there
 * aren't at least one inflow and one outflow to solve between (no sign
 * change means no rate makes the NPV cross zero), or when a root can't
 * be bracketed within a generous search range.
 */
export function computeXirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null;
  // With zero time elapsed between every flow, every term's discount factor is 1
  // regardless of rate, so NPV(rate) is a constant, never a function with a
  // root to solve for - there's no annualized rate when no time has passed.
  if (flows.every((f) => f.days === flows[0].days)) return null;

  let low = -0.999999;
  let high = 10; // 1000% p.a. - generous upper bound for a bracket search
  let npvLow = netPresentValue(low, flows);
  let npvHigh = netPresentValue(high, flows);

  let expandAttempts = 0;
  while (npvLow * npvHigh > 0 && expandAttempts < 40) {
    high *= 2;
    npvHigh = netPresentValue(high, flows);
    expandAttempts += 1;
  }
  if (npvLow * npvHigh > 0) return null;

  let mid = (low + high) / 2;
  for (let i = 0; i < 200; i++) {
    mid = (low + high) / 2;
    const npvMid = netPresentValue(mid, flows);
    if (Math.abs(npvMid) < 1e-7 || high - low < 1e-12) break;
    if ((npvMid > 0) === (npvLow > 0)) {
      low = mid;
      npvLow = npvMid;
    } else {
      high = mid;
    }
  }
  return mid;
}

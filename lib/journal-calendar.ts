/**
 * Pure month-grid engine for the Journal's P&L calendar (built new - the
 * app had no calendar before this). Scope decision: a day's P&L is the
 * sum of REALISED P&L for trades whose `sell_date` falls on that day -
 * the unambiguous, standard "trading calendar" meaning. Open trades
 * (no sell_date yet) never appear here; their unrealised P&L already has
 * its own home on the Open trades table and Dashboard widget.
 *
 * Deliberately UTC-anchored and string-based throughout, never relying
 * on date-fns `format()` on a UTC-built Date (which reads back the
 * Date's *local* getters) or on the host's local timezone in any way -
 * `buy_date`/`sell_date` are already naive "yyyy-MM-dd" calendar dates
 * with no attached timezone (typed into an `<input type="date">`), so
 * the only way to introduce a timezone bug here is in OUR OWN date math,
 * not in the stored data.
 */

export interface CalendarTrade {
  id: string;
  ticker: string;
  exchange: string | null;
  sellDate: string; // yyyy-MM-dd
  pnlAbs: number;
}

export interface CalendarDay {
  date: string; // yyyy-MM-dd
  inMonth: boolean;
  /** null = no closed trades that day (shown neutral, not "zero P&L"). */
  pnl: number | null;
  trades: CalendarTrade[];
}

export interface CalendarMonth {
  /** "yyyy-MM" */
  month: string;
  label: string; // e.g. "November 2026"
  /** Monday-first weeks, 7 days each, always starting/ending outside-month days to fill a full grid. */
  weeks: CalendarDay[][];
  monthTotalPnl: number;
  tradingDayCount: number;
  winDayCount: number;
  lossDayCount: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoFromUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Validates and normalizes a "yyyy-MM" month key; throws on garbage input rather than silently showing the wrong month. */
function parseMonthKey(monthKey: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error(`Invalid month key: "${monthKey}" (expected yyyy-MM).`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month key: "${monthKey}" (month out of range).`);
  return { year, month };
}

/** The next/previous month's "yyyy-MM" key - handles December->January and January->December year rollovers. */
export function shiftMonth(monthKey: string, delta: number): string {
  const { year, month } = parseMonthKey(monthKey);
  const zeroBased = month - 1 + delta;
  const newYear = year + Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12;
  return `${newYear}-${pad2(newMonth + 1)}`;
}

/** Monday=0 .. Sunday=6, from JS's native Sunday=0..Saturday=6. */
function mondayFirstWeekday(utcDate: Date): number {
  return (utcDate.getUTCDay() + 6) % 7;
}

/**
 * Builds a full Monday-first calendar grid for `monthKey` ("yyyy-MM"),
 * attributing each trade to its `sellDate` and summing P&L per day.
 * `trades` can span any range - only the ones whose sellDate falls
 * within the displayed grid are used, so callers don't need to
 * pre-filter by month themselves.
 */
export function buildCalendarMonth(trades: CalendarTrade[], monthKey: string): CalendarMonth {
  const { year, month } = parseMonthKey(monthKey);

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstOfNextMonth = new Date(Date.UTC(year, month, 1));
  const lastOfMonth = new Date(firstOfNextMonth.getTime() - 86_400_000);

  const gridStart = new Date(firstOfMonth.getTime() - mondayFirstWeekday(firstOfMonth) * 86_400_000);
  const daysAfterMonthEnd = 6 - mondayFirstWeekday(lastOfMonth);
  const gridEnd = new Date(lastOfMonth.getTime() + daysAfterMonthEnd * 86_400_000);

  const tradesByDate = new Map<string, CalendarTrade[]>();
  for (const trade of trades) {
    const list = tradesByDate.get(trade.sellDate) ?? [];
    list.push(trade);
    tradesByDate.set(trade.sellDate, list);
  }
  // Stable, deterministic order within a day regardless of input order - avoids a "duplicate-looking" re-shuffle on every render.
  for (const list of tradesByDate.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const monthPrefix = `${year}-${pad2(month)}`;
  const weeks: CalendarDay[][] = [];
  let monthTotalPnl = 0;
  let tradingDayCount = 0;
  let winDayCount = 0;
  let lossDayCount = 0;

  for (let cursor = gridStart.getTime(); cursor <= gridEnd.getTime(); cursor += 7 * 86_400_000) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(cursor + i * 86_400_000);
      const date = isoFromUtc(dayDate);
      const dayTrades = tradesByDate.get(date) ?? [];
      const inMonth = date.startsWith(monthPrefix);
      const pnl = dayTrades.length > 0 ? dayTrades.reduce((sum, t) => sum + t.pnlAbs, 0) : null;

      if (inMonth && pnl !== null) {
        monthTotalPnl += pnl;
        tradingDayCount += 1;
        if (pnl > 0) winDayCount += 1;
        else if (pnl < 0) lossDayCount += 1;
      }

      week.push({ date, inMonth, pnl, trades: dayTrades });
    }
    weeks.push(week);
  }

  return {
    month: monthKey,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    weeks,
    monthTotalPnl,
    tradingDayCount,
    winDayCount,
    lossDayCount,
  };
}

/**
 * Generic "yyyy-mm-01" string helpers shared by every month-by-month
 * tracker (Mutual Funds, NPS, ...) - plain integer/string arithmetic,
 * never a `Date` object (the same reason as `lib/journal-calendar.ts`: a
 * `Date`-based computation that happens to be read back with local
 * getters is a latent timezone bug, so this avoids `Date` entirely).
 */

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-01" -> "Mar 2026" - string slicing, never a Date object. */
export function monthLabel(month: string): string {
  const year = month.slice(0, 4);
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return `${MONTH_NAMES[monthIndex] ?? "?"} ${year}`;
}

/** "yyyy-mm-01" shifted by `deltaMonths` (negative goes back) - pure integer arithmetic, no Date object. */
export function shiftMonth(month: string, deltaMonths: number): string {
  const year = Number(month.slice(0, 4));
  const zeroBasedMonth = Number(month.slice(5, 7)) - 1;
  const total = year * 12 + zeroBasedMonth + deltaMonths;
  const newYear = Math.floor(total / 12);
  const newMonth = ((total % 12) + 12) % 12;
  return `${newYear}-${String(newMonth + 1).padStart(2, "0")}-01`;
}

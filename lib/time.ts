/**
 * Timezone helpers for the week_ending rule (BRIEF.md §5):
 * "convert `time` to the exchange's timezone (India: Asia/Kolkata, US:
 * America/New_York); Mon–Fri → that week's Friday; Sat/Sun → the previous
 * Friday." TradingView alert `time` is always Asia/Kolkata wall-clock time
 * regardless of market.
 */

import { addDays, format, subDays } from "date-fns";
import type { Market } from "./db/schema-types";

const EXCHANGE_TIMEZONE: Record<Market, string> = {
  IN: "Asia/Kolkata",
  US: "America/New_York",
};

/** Parses TradingView's `"YYYY-MM-DD HH:mm"` IST string into a UTC instant. */
export function parseIstAlertTime(time: string): Date {
  const iso = `${time.replace(" ", "T")}:00+05:30`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unparseable alert time: "${time}"`);
  }
  return parsed;
}

/** Y/M/D calendar date (no time) of `instant` as seen in `timeZone`. */
function localCalendarDate(instant: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

/**
 * The Friday that "closes" the week containing `instant`'s calendar date in
 * the given market's exchange timezone, per the Mon-Fri/Sat-Sun rule.
 */
export function weekEndingForAlert(instant: Date, market: Market): string {
  const localDate = localCalendarDate(instant, EXCHANGE_TIMEZONE[market]);
  const weekday = localDate.getUTCDay(); // 0 = Sun ... 6 = Sat

  let friday: Date;
  if (weekday === 0) friday = subDays(localDate, 2); // Sunday -> previous Friday
  else if (weekday === 6) friday = subDays(localDate, 1); // Saturday -> previous Friday
  else friday = addDays(localDate, 5 - weekday); // Mon(1)..Fri(5) -> this week's Friday

  return format(friday, "yyyy-MM-dd");
}

/** Sector board §5c: `week` is the Monday bar-open date; week_ending = Monday + 4 days. */
export function weekEndingFromMonday(mondayIso: string): string {
  const [year, month, day] = mondayIso.split("-").map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day));
  return format(addDays(monday, 4), "yyyy-MM-dd");
}

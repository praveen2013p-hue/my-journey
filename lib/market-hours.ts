/**
 * Market open/closed check, BRIEF.md §10: "India 09:15-15:30 IST Mon-Fri;
 * US 09:30-16:00 America/New_York (DST-aware) Mon-Fri." Used to decide
 * whether to poll for live prices at all (§10) and what the data-freshness
 * strip says (§14.2). Holidays (§17.7) aren't checked here yet — the
 * `holidays` table exists but isn't consulted until Phase 2/3 wiring.
 */

import type { Market } from "./db/schema-types";

interface MarketHours {
  timeZone: string;
  openMinute: number; // minutes since local midnight
  closeMinute: number;
}

const HOURS: Record<Market, MarketHours> = {
  IN: { timeZone: "Asia/Kolkata", openMinute: 9 * 60 + 15, closeMinute: 15 * 60 + 30 },
  US: { timeZone: "America/New_York", openMinute: 9 * 60 + 30, closeMinute: 16 * 60 },
};

function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: get("weekday"), hour: Number(get("hour")), minute: Number(get("minute")) };
}

export function isMarketOpen(market: Market, now: Date = new Date()): boolean {
  const { timeZone, openMinute, closeMinute } = HOURS[market];
  const { weekday, hour, minute } = localParts(now, timeZone);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const minutesOfDay = hour * 60 + minute;
  // Half-open interval: open AT the opening minute, closed AT (not past) the
  // closing minute - "09:15-15:30"/"09:30-16:00" means 15:30/16:00 is already
  // closed, not one more open minute.
  return minutesOfDay >= openMinute && minutesOfDay < closeMinute;
}

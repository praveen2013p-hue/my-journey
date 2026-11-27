/**
 * Settings -> "Alert health" panel, BRIEF.md §17.1: "alerts received this
 * week vs the previous week, last alert time, rejected count", plus a
 * warning if nothing arrived by Saturday noon IST in a normal week.
 */

import { getLatestAcceptedRawReceivedAt, listAlertsRawSince } from "./db/alerts";

export interface AlertHealth {
  acceptedThisWeek: number;
  acceptedLastWeek: number;
  rejectedThisWeek: number;
  lastAlertAt: string | null;
  /** True when it's past Saturday 12:00 IST and nothing arrived this week. */
  missingThisWeek: boolean;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getAlertHealth(now: Date = new Date()): Promise<AlertHealth> {
  const twoWeeksAgo = new Date(now.getTime() - 2 * ONE_WEEK_MS);
  const oneWeekAgo = new Date(now.getTime() - ONE_WEEK_MS);

  // This fetch is bounded to 2 weeks for the this-week/last-week counts
  // below, which only ever need that window. `lastAlertAt` must NOT be
  // derived from it - once the webhook has been silent longer than 2
  // weeks, that would wrongly report "no alerts ever" instead of the real
  // (stale) last-alert time, so it uses the dedicated unbounded lookup.
  const rows = await listAlertsRawSince(twoWeeksAgo.toISOString());
  const thisWeek = rows.filter((r) => r.received_at >= oneWeekAgo.toISOString());
  const lastWeek = rows.filter((r) => r.received_at < oneWeekAgo.toISOString());

  const lastAlertAt = await getLatestAcceptedRawReceivedAt();

  const istNow = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = istNow.find((p) => p.type === "weekday")?.value;
  const hour = Number(istNow.find((p) => p.type === "hour")?.value ?? 0);
  const pastSaturdayNoon =
    weekday === "Sun" || (weekday === "Sat" && hour >= 12);

  return {
    acceptedThisWeek: thisWeek.filter((r) => r.accepted).length,
    acceptedLastWeek: lastWeek.filter((r) => r.accepted).length,
    rejectedThisWeek: thisWeek.filter((r) => !r.accepted).length,
    lastAlertAt,
    missingThisWeek: pastSaturdayNoon && thisWeek.filter((r) => r.accepted).length === 0,
  };
}

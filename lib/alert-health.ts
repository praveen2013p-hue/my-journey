/**
 * Settings -> "Alert health" panel, BRIEF.md §17.1: "alerts received this
 * week vs the previous week, last alert time, rejected count", plus a
 * warning if nothing arrived by Saturday noon IST in a normal week.
 */

import { listAlertsRawSince } from "./db/alerts";

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

  const rows = await listAlertsRawSince(twoWeeksAgo.toISOString());
  const thisWeek = rows.filter((r) => r.received_at >= oneWeekAgo.toISOString());
  const lastWeek = rows.filter((r) => r.received_at < oneWeekAgo.toISOString());

  const accepted = rows.filter((r) => r.accepted);
  const lastAlertAt = accepted.reduce<string | null>(
    (latest, r) => (latest === null || r.received_at > latest ? r.received_at : latest),
    null,
  );

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

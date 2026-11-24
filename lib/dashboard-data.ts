/**
 * Server-side data assembly for Dashboard widgets 1-3, BRIEF.md §7.3.
 * Widget 4 (open trades/P&L) needs the trades table and ships in Phase 3.
 */

import { addDays, format } from "date-fns";
import { listAlerts } from "./db/alerts";
import type { Grade, Market } from "./db/schema-types";
import { getSectorsPageData } from "./sectors-page-data";

export interface TriggerCounts {
  breakout: Record<Market, Record<Grade, number>>;
  pullback: Record<Market, number>;
}

export interface TopSector {
  market: Market;
  sector: string;
  mrs: number | null;
}

export interface DashboardData {
  weekEnding: string | null;
  prevWeek: string;
  nextWeek: string;
  triggers: TriggerCounts;
  topSectors: TopSector[];
}

function emptyTriggerCounts(): TriggerCounts {
  return {
    breakout: {
      IN: { A: 0, B: 0, C: 0 },
      US: { A: 0, B: 0, C: 0 },
    },
    pullback: { IN: 0, US: 0 },
  };
}

async function resolveWeekEnding(requested?: string): Promise<string | null> {
  if (requested) return requested;
  const all = await listAlerts({});
  if (all.length === 0) return null;
  return all.reduce((latest, a) => (a.week_ending > latest ? a.week_ending : latest), all[0].week_ending);
}

export async function getDashboardData(requestedWeek?: string): Promise<DashboardData> {
  const weekEnding = await resolveWeekEnding(requestedWeek);
  const triggers = emptyTriggerCounts();
  let topSectors: TopSector[] = [];

  if (weekEnding) {
    const weekAlerts = await listAlerts({ weekEnding });
    for (const alert of weekAlerts) {
      if (alert.signal_type === "breakout") {
        triggers.breakout[alert.market][alert.grade] += 1;
      } else {
        triggers.pullback[alert.market] += 1;
      }
    }

    const [india, us] = await Promise.all([getSectorsPageData("IN"), getSectorsPageData("US")]);
    topSectors = [
      ...india.rows.filter((r) => r.isFocus).map((r) => ({ market: "IN" as Market, sector: r.sector, mrs: r.mrs })),
      ...us.rows.filter((r) => r.isFocus).map((r) => ({ market: "US" as Market, sector: r.sector, mrs: r.mrs })),
    ]
      .sort((a, b) => (b.mrs ?? -Infinity) - (a.mrs ?? -Infinity))
      .slice(0, 8);
  }

  const base = weekEnding ?? format(new Date(), "yyyy-MM-dd");
  const [y, m, d] = base.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));

  return {
    weekEnding,
    prevWeek: format(addDays(anchor, -7), "yyyy-MM-dd"),
    nextWeek: format(addDays(anchor, 7), "yyyy-MM-dd"),
    triggers,
    topSectors,
  };
}

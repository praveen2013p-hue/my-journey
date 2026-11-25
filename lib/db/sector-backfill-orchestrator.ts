/**
 * Wires the pure backfill engine (lib/sector-backfill.ts) to providers and
 * storage for one market - BRIEF.md §7.2's "Backfill on first run." Safe
 * to re-run (idempotent per sector: re-fetches and overwrites its own
 * 'backfill' rows) and respects §17.4: a week that already has an
 * 'alert'-sourced snapshot is never touched.
 *
 * Only ever backfills sectors with a resolved `provider_symbol` - the rest
 * already show up in Settings as "unresolved sector indices" (§7.6) and
 * stay that way until a real TradingView/Kite symbol is confirmed for
 * them, same honesty principle as sector-map-seed.ts.
 */

import { format, subDays } from "date-fns";
import { BENCHMARK_SYMBOL } from "../regime";
import {
  BACKFILL_FETCH_WEEKS,
  computeBackfillWeeks,
  type WeeklyClose,
} from "../sector-backfill";
import { weekEndingForAlert } from "../time";
import { getProviderForMarket } from "../providers";
import type { DailyBar } from "../providers/types";
import type { Market } from "./schema-types";
import { listSectorMap } from "./sector-map";
import { listSectorSnapshotHistory, upsertSectorSnapshotsBulk, type UpsertSectorSnapshotInput } from "./sectors";

function localNoon(dateIso: string, market: Market): Date {
  return new Date(market === "IN" ? `${dateIso}T12:00:00+05:30` : `${dateIso}T12:00:00-05:00`);
}

/** Daily bars (oldest-first) into Friday-ending weekly closes - the last daily close written per week wins. */
function toWeeklyCloses(bars: DailyBar[], market: Market): WeeklyClose[] {
  const byWeek = new Map<string, number>();
  for (const bar of bars) {
    byWeek.set(weekEndingForAlert(localNoon(bar.date, market), market), bar.close);
  }
  return Array.from(byWeek.entries())
    .map(([weekEnding, close]) => ({ weekEnding, close }))
    .sort((a, b) => (a.weekEnding < b.weekEnding ? -1 : 1));
}

export type SectorBackfillStatus = "stored" | "no-provider-symbol" | "no-price-data";

export interface SectorBackfillResult {
  sector: string;
  status: SectorBackfillStatus;
  weeksStored: number;
  weeksSkippedExistingAlert: number;
}

export async function backfillSectorIndexHistory(market: Market): Promise<SectorBackfillResult[]> {
  const provider = getProviderForMarket(market);
  const to = format(new Date(), "yyyy-MM-dd");
  const from = format(subDays(new Date(), BACKFILL_FETCH_WEEKS * 7 + 7), "yyyy-MM-dd");

  const [benchBars, sectors, existingHistory] = await Promise.all([
    provider.getDailyHistory(BENCHMARK_SYMBOL[market], from, to),
    listSectorMap(market),
    listSectorSnapshotHistory(market),
  ]);
  const benchCloses = toWeeklyCloses(benchBars, market);

  const existingAlertWeeksBySector = new Map<string, Set<string>>();
  for (const row of existingHistory) {
    if (row.source !== "alert") continue;
    const set = existingAlertWeeksBySector.get(row.sector) ?? new Set<string>();
    set.add(row.week_ending);
    existingAlertWeeksBySector.set(row.sector, set);
  }

  const results: SectorBackfillResult[] = [];

  // Sequential, not Promise.all: Kite's shared rate limiter already
  // throttles the underlying fetches, but running 20+ sectors' calls
  // concurrently here would still mean we're writing huge result arrays
  // to Supabase all at once instead of one bulk upsert at a time.
  for (const sectorRow of sectors) {
    if (!sectorRow.provider_symbol) {
      results.push({ sector: sectorRow.display_name, status: "no-provider-symbol", weeksStored: 0, weeksSkippedExistingAlert: 0 });
      continue;
    }

    const bars = await provider.getDailyHistory(sectorRow.provider_symbol, from, to);
    const closes = toWeeklyCloses(bars, market);
    if (closes.length === 0) {
      results.push({ sector: sectorRow.display_name, status: "no-price-data", weeksStored: 0, weeksSkippedExistingAlert: 0 });
      continue;
    }

    const weeks = computeBackfillWeeks(closes, benchCloses);
    const alertWeeks = existingAlertWeeksBySector.get(sectorRow.display_name) ?? new Set<string>();

    const rows: UpsertSectorSnapshotInput[] = [];
    let skipped = 0;
    for (const week of weeks) {
      if (alertWeeks.has(week.weekEnding)) {
        skipped++;
        continue;
      }
      rows.push({
        market,
        week_ending: week.weekEnding,
        sector: sectorRow.display_name,
        stage: week.stage,
        mrs: week.mrs,
        rs_up: null,
        vs_ma: week.vsMa,
        chg4: week.chg4,
        focus: week.focus,
        source: "backfill",
      });
    }

    await upsertSectorSnapshotsBulk(rows);
    results.push({ sector: sectorRow.display_name, status: "stored", weeksStored: rows.length, weeksSkippedExistingAlert: skipped });
  }

  return results;
}

/**
 * "Sector rotation matrix" (DECISIONS.md backlog): each sector's RS rank
 * for each of the last several weeks, so money flow between sectors
 * shows as a grid instead of one sector's sparkline at a time. Scoped to
 * "sector" kind rows only (not industries) - rotation is a sector-level
 * concept, and mixing both kinds into one rank would be comparing two
 * different groupings.
 */

import { format, subWeeks } from "date-fns";
import { listSectorMap } from "./db/sector-map";
import { listRecentSectorSnapshotHistory } from "./db/sectors";
import type { Market } from "./db/schema-types";

const ROTATION_LOOKBACK_WEEKS = 13;

export interface SectorRotationMatrix {
  /** Oldest first. */
  weeks: string[];
  /** Ordered by most recent known rank (strongest first), unknowns last. */
  sectors: string[];
  /** rank[sector][week] - 1 means strongest RS that week; null if that sector had no snapshot that week. */
  ranks: Record<string, Record<string, number | null>>;
}

export async function getSectorRotationMatrix(market: Market): Promise<SectorRotationMatrix> {
  const sectorMapRows = await listSectorMap(market);
  const sectorNames = sectorMapRows.filter((r) => r.kind === "sector").map((r) => r.display_name);
  if (sectorNames.length === 0) return { weeks: [], sectors: [], ranks: {} };

  const sinceWeekEnding = format(subWeeks(new Date(), ROTATION_LOOKBACK_WEEKS + 2), "yyyy-MM-dd");
  const history = await listRecentSectorSnapshotHistory(market, sinceWeekEnding);

  const sectorNameSet = new Set(sectorNames);
  const byWeek = new Map<string, Array<{ sector: string; mrs: number }>>();
  for (const snap of history) {
    if (!sectorNameSet.has(snap.sector) || snap.mrs === null) continue;
    const list = byWeek.get(snap.week_ending) ?? [];
    list.push({ sector: snap.sector, mrs: snap.mrs });
    byWeek.set(snap.week_ending, list);
  }

  const weeks = Array.from(byWeek.keys())
    .sort()
    .slice(-ROTATION_LOOKBACK_WEEKS);

  const ranks: Record<string, Record<string, number | null>> = {};
  for (const sector of sectorNames) ranks[sector] = {};

  for (const week of weeks) {
    const entries = (byWeek.get(week) ?? []).sort((a, b) => b.mrs - a.mrs);
    const rankBySector = new Map<string, number>();
    entries.forEach((e, i) => rankBySector.set(e.sector, i + 1));
    for (const sector of sectorNames) {
      ranks[sector][week] = rankBySector.get(sector) ?? null;
    }
  }

  const latestWeek = weeks[weeks.length - 1];
  const sectors = [...sectorNames].sort((a, b) => {
    const ra = latestWeek ? ranks[a][latestWeek] : null;
    const rb = latestWeek ? ranks[b][latestWeek] : null;
    if (ra === null && rb === null) return a.localeCompare(b);
    if (ra === null) return 1;
    if (rb === null) return -1;
    return ra - rb;
  });

  return { weeks, sectors, ranks };
}

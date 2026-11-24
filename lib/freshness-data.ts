import { getLatestAcceptedRawReceivedAt } from "./db/alerts";
import { getLatestSectorSnapshotTime } from "./db/sectors";
import { formatIst } from "./format-ist";
import { isMarketOpen } from "./market-hours";

function getMarketsNote(): string {
  const indiaLive = Boolean(process.env.KITE_API_KEY);
  return indiaLive
    ? "India live via Zerodha Kite · US delayed ~15 min (Yahoo)"
    : "India mock data until Zerodha is connected · US delayed ~15 min (Yahoo)";
}

export interface FreshnessData {
  pricesLabel: string;
  pricesLevel: "green" | "amber" | "red";
  marketsNote: string;
  alertsReceivedLabel: string;
  sectorSnapshotLabel: string;
}

/** Feeds the "Data last updated" strip, BRIEF.md §14.2. */
export async function getFreshnessData(): Promise<FreshnessData> {
  const [alertsAt, sectorAt] = await Promise.all([
    getLatestAcceptedRawReceivedAt(),
    getLatestSectorSnapshotTime(),
  ]);
  const anyMarketOpen = isMarketOpen("IN") || isMarketOpen("US");

  return {
    pricesLabel: anyMarketOpen ? formatIst(new Date()) : "Market closed — showing last close",
    pricesLevel: anyMarketOpen ? "green" : "amber",
    marketsNote: getMarketsNote(),
    alertsReceivedLabel: alertsAt ? formatIst(alertsAt) : "none yet",
    sectorSnapshotLabel: sectorAt ? formatIst(sectorAt) : "none yet",
  };
}

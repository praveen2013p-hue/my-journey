"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshIcon } from "./icons";

export type FreshnessLevel = "green" | "amber" | "red";

interface DataFreshnessStripProps {
  pricesLabel: string;
  pricesLevel: FreshnessLevel;
  marketsNote: string;
  alertsReceivedLabel: string;
  sectorSnapshotLabel: string;
}

const DOT_CLASS: Record<FreshnessLevel, string> = {
  green: "bg-pos",
  amber: "bg-warn",
  red: "bg-neg",
};

/** BRIEF.md §14.2: the "Data last updated" strip on every app page. */
export function DataFreshnessStrip({
  pricesLabel,
  pricesLevel,
  marketsNote,
  alertsReceivedLabel,
  sectorSnapshotLabel,
}: DataFreshnessStripProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }

  return (
    <div
      role="status"
      aria-label="Data freshness"
      className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-[10px] border border-border bg-panel-alt px-3.5 py-2 text-xs text-muted"
    >
      <span className="flex items-center gap-1.5">
        <span className={`inline-block h-[9px] w-[9px] rounded-full ${DOT_CLASS[pricesLevel]}`} />
        <b className="font-semibold text-text">Prices updated</b> {pricesLabel}
      </span>
      <span>{marketsNote}</span>
      <span>
        <b className="font-semibold text-text">Alerts received</b> {alertsReceivedLabel}
      </span>
      <span>
        <b className="font-semibold text-text">Sector snapshot</b> {sectorSnapshotLabel}
      </span>
      <button
        type="button"
        onClick={handleRefresh}
        aria-label="Refresh prices now"
        className="ml-auto flex min-h-[32px] items-center gap-2 rounded-md border border-border-strong bg-panel px-2.5 py-1 text-xs font-medium text-text hover:bg-panel-alt"
      >
        <RefreshIcon className={refreshing ? "animate-spin" : ""} />
        Refresh now
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { formatMoney, formatPct } from "@/lib/format-money";
import type { NpsYearGroup } from "@/lib/nps-stats";
import { YearRows } from "./YearSection";

/** Square year tiles in a grid - an alternative to the stacked list, click a tile to see that year's months below. */
export function YearGrid({ groups }: { groups: NpsYearGroup[] }) {
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const selected = groups.find((g) => g.year === selectedYear) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
        {groups.map((group) => {
          const isSelected = group.year === selectedYear;
          return (
            <button
              key={group.year}
              type="button"
              onClick={() => setSelectedYear(isSelected ? null : group.year)}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border p-2 text-center transition-colors ${
                isSelected
                  ? "border-gold-border bg-gold-wash-strong"
                  : "border-border bg-panel hover:border-border-strong hover:bg-panel-alt"
              }`}
            >
              <span className={`text-base font-semibold ${isSelected ? "text-gold-light" : ""}`}>{group.year}</span>
              <span className="text-[11px] text-muted">
                {group.rows.length} entr{group.rows.length === 1 ? "y" : "ies"}
              </span>
              <span className="text-[11px] text-muted">
                Added <span className="font-medium text-text">{formatMoney("IN", group.yearInvested)}</span>
              </span>
              <span className="text-[11px] text-muted">
                Value <span className="font-medium text-text">{formatMoney("IN", group.yearEndValue)}</span>
              </span>
              <span className="text-[11px] text-muted">
                XIRR{" "}
                {group.yearEndXirrPct === null ? (
                  <span className="font-medium">—</span>
                ) : (
                  <span className={`font-medium ${group.yearEndXirrPct >= 0 ? "text-pos" : "text-neg"}`}>
                    {formatPct(group.yearEndXirrPct)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="rounded-xl border border-border bg-panel p-3">
          <h3 className="mb-2 px-2 text-sm font-semibold">{selected.year}</h3>
          <YearRows rows={selected.rows} />
          <div className="mt-2 px-2 text-sm">
            <span className="text-muted">{selected.year} XIRR (since inception, as of year-end): </span>
            {selected.yearEndXirrPct === null ? (
              <span className="font-semibold text-muted">—</span>
            ) : (
              <span className={`font-semibold ${selected.yearEndXirrPct >= 0 ? "text-pos" : "text-neg"}`}>
                {formatPct(selected.yearEndXirrPct)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

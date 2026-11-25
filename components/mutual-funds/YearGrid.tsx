"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format-money";
import type { MutualFundYearGroup } from "@/lib/mutual-fund-stats";
import { YearRows } from "./YearSection";

/** Square year tiles in a grid - an alternative to the stacked list, click a tile to see that year's months below. */
export function YearGrid({ groups }: { groups: MutualFundYearGroup[] }) {
  const [selectedYear, setSelectedYear] = useState(groups[0]?.year ?? null);
  const selected = groups.find((g) => g.year === selectedYear) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {groups.map((group) => {
          const isSelected = group.year === selectedYear;
          return (
            <button
              key={group.year}
              type="button"
              onClick={() => setSelectedYear(group.year)}
              className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                isSelected
                  ? "border-gold-border bg-gold-wash-strong"
                  : "border-border bg-panel hover:border-border-strong hover:bg-panel-alt"
              }`}
            >
              <span className={`text-2xl font-semibold ${isSelected ? "text-gold-light" : ""}`}>{group.year}</span>
              <span className="text-xs text-muted">
                {group.rows.length} entr{group.rows.length === 1 ? "y" : "ies"}
              </span>
              <span className="text-xs text-muted">
                Added <span className="font-medium text-text">{formatMoney("IN", group.yearInvested)}</span>
              </span>
              <span className="text-xs text-muted">
                Value <span className="font-medium text-text">{formatMoney("IN", group.yearEndValue)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="rounded-xl border border-border bg-panel p-3">
          <h3 className="mb-2 px-2 text-sm font-semibold">{selected.year}</h3>
          <YearRows rows={selected.rows} />
        </div>
      )}
    </div>
  );
}

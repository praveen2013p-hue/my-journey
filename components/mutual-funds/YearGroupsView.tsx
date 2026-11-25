"use client";

import { useEffect, useState } from "react";
import type { MutualFundYearGroup } from "@/lib/mutual-fund-stats";
import { YearGrid } from "./YearGrid";
import { YearSection } from "./YearSection";

type ViewMode = "list" | "grid";

const VIEW_STORAGE_KEY = "mj.mutualFunds.yearView";

/** List (current stacked, collapsible-per-year) vs Grid (square year tiles, click to see that year's months) - a look preference, not new data. */
export function YearGroupsView({ groups }: { groups: MutualFundYearGroup[] }) {
  const [view, setView] = useState<ViewMode>("list");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "list" || stored === "grid") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setView(stored);
      }
    } catch {
      // localStorage unavailable (private window etc.) - default to list.
    }
  }, []);

  function choose(next: ViewMode) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-2">
        {(["list", "grid"] as ViewMode[]).map((mode) => (
          <span
            key={mode}
            role="button"
            tabIndex={0}
            onClick={() => choose(mode)}
            onKeyDown={(e) => e.key === "Enter" && choose(mode)}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize ${
              view === mode
                ? "border-gold-border bg-gold-wash-strong text-gold-light"
                : "border-border-strong text-muted"
            }`}
          >
            {mode}
          </span>
        ))}
      </div>

      {view === "grid" ? (
        <YearGrid groups={groups} />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group, i) => (
            <YearSection key={group.year} group={group} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

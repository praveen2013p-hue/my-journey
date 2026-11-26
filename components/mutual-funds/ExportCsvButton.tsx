"use client";

import { mutualFundEntriesToCsv } from "@/lib/mutual-fund-csv";
import type { MutualFundEntryRow } from "@/lib/db/schema-types";

/** Downloads this profile's full entry history as CSV - same column shape the import button expects back. */
export function ExportCsvButton({
  entries,
  profileName,
}: {
  entries: MutualFundEntryRow[];
  profileName: string;
}) {
  function handleExport() {
    const csv = mutualFundEntriesToCsv(entries);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeName = profileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "profile";
    const a = document.createElement("a");
    a.href = url;
    a.download = `mutual-fund-${safeName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={entries.length === 0}
      className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border-strong bg-panel-alt px-3.5 text-text hover:bg-panel disabled:opacity-50"
    >
      Export CSV
    </button>
  );
}

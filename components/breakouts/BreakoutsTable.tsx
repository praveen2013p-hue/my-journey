"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Chip, gradeVariant } from "@/components/Chip";
import { TradingViewLink } from "@/components/TradingViewLink";
import { AddToButton } from "@/components/journal/AddToButton";
import type { BreakoutRow } from "@/lib/breakouts-data";
import type { SignalType } from "@/lib/db/schema-types";
import { quoteKey, useQuotes } from "@/lib/use-quotes";

// The side panel pulls in `lightweight-charts` (a genuinely heavy
// dependency) for its weekly chart - lazy-loaded so that weight is only
// ever downloaded once a row is actually clicked, not as part of every
// Breakouts/Pullbacks page's initial JS (DECISIONS.md).
const SidePanel = dynamic(() => import("./SidePanel").then((m) => m.SidePanel), {
  ssr: false,
  loading: () => (
    <aside className="flex w-full flex-shrink-0 flex-col gap-4 border-l border-border bg-panel-alt p-6 md:w-[430px]">
      <div className="h-6 w-2/3 animate-pulse rounded bg-panel" />
      <div className="h-24 animate-pulse rounded bg-panel" />
      <div className="h-48 animate-pulse rounded bg-panel" />
    </aside>
  ),
});

type SortKey =
  | "ticker"
  | "grade"
  | "trigger"
  | "live"
  | "since"
  | "volRatio"
  | "mrs"
  | "quality";

function fmtNum(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function SortHeader({
  label,
  k,
  className,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  k: SortKey;
  className?: string;
  sortKey: SortKey;
  sortDir: 1 | -1;
  onToggle: (k: SortKey) => void;
}) {
  return (
    <th
      scope="col"
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted hover:text-text ${className ?? ""}`}
      onClick={() => onToggle(k)}
    >
      {label} {sortKey === k && (sortDir === 1 ? "▲" : "▼")}
    </th>
  );
}

export function BreakoutsTable({
  rows,
  signalType,
}: {
  rows: BreakoutRow[];
  signalType: SignalType;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("quality");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const quotes = useQuotes(rows.map((r) => ({ market: r.market, symbol: r.providerSymbol })));

  function quoteFor(row: BreakoutRow) {
    return row.providerSymbol ? quotes.get(quoteKey(row.market, row.providerSymbol)) : undefined;
  }

  const sorted = useMemo(() => {
    const withLive = rows.map((row) => {
      const q = quoteFor(row);
      const live = q?.price ?? null;
      const pctSince = live !== null ? ((live - row.triggerPrice) / row.triggerPrice) * 100 : null;
      return { row, live, pctSince };
    });

    const keyFns: Record<SortKey, (r: (typeof withLive)[number]) => number | string> = {
      ticker: (r) => r.row.ticker,
      grade: (r) => r.row.grade,
      trigger: (r) => r.row.triggerPrice,
      live: (r) => r.live ?? -Infinity,
      since: (r) => r.pctSince ?? -Infinity,
      volRatio: (r) => r.row.volRatio ?? -Infinity,
      mrs: (r) => r.row.mrs ?? -Infinity,
      quality: (r) => r.row.qualityScore ?? -Infinity,
    };
    const getKey = keyFns[sortKey];

    return [...withLive].sort((a, b) => {
      const ka = getKey(a);
      const kb = getKey(b);
      if (ka < kb) return -1 * sortDir;
      if (ka > kb) return 1 * sortDir;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir, quotes]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1) as 1 | -1);
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-5 lg:flex-nowrap">
      <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border bg-panel">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2.5" />
              <SortHeader label="Stock" k="ticker" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted">
                Market
              </th>
              <SortHeader label="Grade" k="grade" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              <SortHeader
                label="Trigger"
                k="trigger"
                className="text-right"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggleSort}
              />
              <SortHeader
                label="Live"
                k="live"
                className="text-right"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggleSort}
              />
              <SortHeader
                label="Since"
                k="since"
                className="text-right"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggleSort}
              />
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-muted">
                Breakout level
              </th>
              <SortHeader
                label="Vol ×"
                k="volRatio"
                className="text-right"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggleSort}
              />
              <SortHeader
                label="RS"
                k="mrs"
                className="text-right"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggleSort}
              />
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted">
                Sector · Industry
              </th>
              <SortHeader
                label="Score"
                k="quality"
                className="text-right"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggleSort}
              />
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted">
                Flags
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-sm text-muted">
                  No alerts match these filters.
                </td>
              </tr>
            )}
            {sorted.map(({ row, live, pctSince }) => {
              const belowMa = live !== null && row.ma30w !== null && live < row.ma30w;
              const extended = live !== null && row.breakoutLevel !== null && live > row.breakoutLevel * 1.2;
              const isSelected = row.id === selectedId;

              return (
                <tr
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`cursor-pointer border-b border-row-border hover:bg-panel-alt ${
                    isSelected ? "bg-gold-wash" : ""
                  }`}
                >
                  <td className="px-3 py-2.5">{row.isNew && <Chip variant="gold">New</Chip>}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <TradingViewLink exchange={row.exchange} ticker={row.ticker} />
                    {signalType === "pullback" && row.originalBreakoutDate && (
                      <div className="text-xs text-muted">
                        Breakout {row.originalBreakoutDate} · Grade {row.originalGrade} ·{" "}
                        {row.weeksSinceBreakout}w ago
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Chip variant="neutral">{row.market}</Chip>
                  </td>
                  <td className="px-3 py-2.5">
                    <Chip variant={gradeVariant(row.grade)}>● {row.grade}</Chip>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {fmtNum(row.triggerPrice)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {row.providerSymbol === null ? (
                      <span className="text-xs text-muted">unavailable</span>
                    ) : live === null ? (
                      <span className="text-xs text-muted">…</span>
                    ) : (
                      fmtNum(live)
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {pctSince === null ? (
                      "—"
                    ) : (
                      <span className={pctSince >= 0 ? "text-pos" : "text-neg"}>
                        {pctSince >= 0 ? "▲ +" : "▼ "}
                        {pctSince.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {fmtNum(row.breakoutLevel)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    <span
                      className={
                        row.volRatio === null
                          ? ""
                          : row.volRatio >= 2
                            ? "text-pos"
                            : row.volRatio >= 1.5
                              ? "text-warn"
                              : "text-neg"
                      }
                    >
                      {row.volRatio !== null ? `${row.volRatio.toFixed(1)}×` : "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    <span className={row.mrs !== null && row.mrs > 0 ? "text-pos" : "text-neg"}>
                      {row.mrs !== null ? (row.mrs > 0 ? "+" : "") + row.mrs.toFixed(1) : "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted">
                    {row.sector ?? "—"}
                    {row.industry ? ` · ${row.industry}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums font-semibold">
                    {row.qualityScore ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex gap-1.5">
                      {belowMa && <Chip variant="red">Below 30W MA</Chip>}
                      {extended && <Chip variant="amber">Extended &gt;20%</Chip>}
                      {!belowMa && !extended && <span className="text-muted">—</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <AddToButton
                      market={row.market}
                      ticker={row.ticker}
                      alertId={row.id}
                      defaultPrice={live ?? row.triggerPrice}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedRow && (
        <SidePanel row={selectedRow} signalType={signalType} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

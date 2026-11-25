"use client";

import { useMemo, useState } from "react";
import { Chip, stageVariant } from "@/components/Chip";
import type { Market } from "@/lib/db/schema-types";
import type { SectorRow } from "@/lib/sectors-page-data";
import { ConstituentsPanel } from "./ConstituentsPanel";
import { Sparkline } from "./Sparkline";

type Period = "4W" | "13W" | "26W" | "52W" | "All";
type SortKey = "rank" | "sector" | "mrs" | "vsMa" | "tradedValue" | "triggerCount";

function fmtPct(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "▲ +" : "▼ "}${Math.abs(value).toFixed(digits)}%`;
}

function fmtNum(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function colorForSigned(value: number | null): string {
  if (value === null) return "text-muted";
  return value >= 0 ? "text-pos" : "text-neg";
}

function colorForRatio(ratio: number | null): string {
  if (ratio === null) return "text-muted";
  if (ratio >= 1.5) return "text-pos";
  if (ratio >= 1.0) return "text-warn";
  return "text-neg";
}

export function SectorsTable({
  rows,
  showKindToggle,
  market,
}: {
  rows: SectorRow[];
  showKindToggle: boolean;
  market: Market;
}) {
  const [period, setPeriod] = useState<Period>("All");
  const [kind, setKind] = useState<"sector" | "industry">("sector");
  const [sortKey, setSortKey] = useState<SortKey>("mrs");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  const filtered = showKindToggle ? rows.filter((r) => r.kind === kind) : rows;

  const sorted = useMemo(() => {
    const keyFns: Record<SortKey, (r: SectorRow) => number | string> = {
      rank: (r) => r.rank ?? Infinity,
      sector: (r) => r.sector,
      mrs: (r) => r.mrs ?? -Infinity,
      vsMa: (r) => r.vsMa ?? -Infinity,
      tradedValue: (r) => r.tradedValue ?? -Infinity,
      triggerCount: (r) => r.triggerCount,
    };
    const getKey = keyFns[sortKey];
    return [...filtered].sort((a, b) => {
      const ka = getKey(a);
      const kb = getKey(b);
      if (ka < kb) return -1 * sortDir;
      if (ka > kb) return 1 * sortDir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1) as 1 | -1);
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  function SortHeader({ label, k, className }: { label: string; k: SortKey; className?: string }) {
    return (
      <th
        scope="col"
        className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted hover:text-text ${className ?? ""}`}
        onClick={() => toggleSort(k)}
      >
        {label} {sortKey === k && (sortDir === 1 ? "▲" : "▼")}
      </th>
    );
  }

  const singlePeriodDelta: Record<Exclude<Period, "All">, (r: SectorRow) => number | null> = {
    "4W": (r) => r.delta4,
    "13W": (r) => r.delta13,
    "26W": (r) => r.delta26,
    "52W": (r) => r.delta52,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showKindToggle ? (
          <div className="flex gap-2">
            <span
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 font-medium ${kind === "sector" ? "border-gold-border bg-gold-wash-strong text-gold-light" : "border-border-strong text-muted"}`}
              onClick={() => setKind("sector")}
            >
              Sectors
            </span>
            <span
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 font-medium ${kind === "industry" ? "border-gold-border bg-gold-wash-strong text-gold-light" : "border-border-strong text-muted"}`}
              onClick={() => setKind("industry")}
            >
              Industries
            </span>
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2 text-sm text-muted">
          RS change over
          {(["4W", "13W", "26W", "52W", "All"] as Period[]).map((p) => (
            <span
              key={p}
              className={`cursor-pointer rounded-full border px-3 py-1 font-medium ${period === p ? "border-gold-border bg-gold-wash-strong text-gold-light" : "border-border-strong text-muted"}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap gap-5 lg:flex-nowrap">
      <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border bg-panel">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <SortHeader label="#" k="rank" />
              <SortHeader label="Sector" k="sector" />
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-muted">
                1W price
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-muted">
                1W RS change
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-muted">
                1W traded value
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-muted">
                Rank move 1W
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted">
                Stage
              </th>
              <SortHeader label="Mansfield RS" k="mrs" className="text-right" />
              {period === "All" ? (
                <>
                  <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-muted">
                    Δ 4W
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-muted">
                    Δ 13W
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-muted">
                    Δ 26W
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-muted">
                    Δ 52W
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted">
                    13W trend
                  </th>
                </>
              ) : (
                <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-muted">
                  Δ {period}
                </th>
              )}
              <SortHeader label="Traded value vs 10W avg" k="tradedValue" className="text-right" />
              <SortHeader label="vs 30W MA" k="vsMa" className="text-right" />
              <SortHeader label="Triggers" k="triggerCount" className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={16} className="px-3 py-8 text-center text-sm text-muted">
                  No sector data for this market yet.
                </td>
              </tr>
            )}
            {sorted.map((row) => (
              <tr
                key={row.sector}
                onClick={() => setSelectedSector(row.sector)}
                className={`cursor-pointer border-b border-row-border hover:bg-panel-alt ${
                  selectedSector === row.sector ? "bg-gold-wash" : ""
                }`}
              >
                <td className="px-3 py-2.5 tabular-nums text-muted">{row.rank ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {row.isFocus && <span className="mr-1.5 text-gold-light">★</span>}
                  {row.sector}
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${colorForSigned(row.priceChg1w)}`}>
                  {fmtPct(row.priceChg1w)}
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${colorForSigned(row.rsChg1w)}`}>
                  {fmtNum(row.rsChg1w)}
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${colorForSigned(row.tradedValueChg1w)}`}>
                  {fmtPct(row.tradedValueChg1w)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  {row.rankMove1w === null ? (
                    <span className="text-muted">–</span>
                  ) : row.rankMove1w === 0 ? (
                    <span className="text-muted">0</span>
                  ) : (
                    <span className={row.rankMove1w > 0 ? "text-pos" : "text-neg"}>
                      {row.rankMove1w > 0 ? "▲" : "▼"} {Math.abs(row.rankMove1w)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Chip variant={stageVariant(row.stage)}>{row.stage ? `Stage ${row.stage}` : "—"}</Chip>
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums font-semibold ${colorForSigned(row.mrs)}`}>
                  {fmtNum(row.mrs)}
                </td>
                {period === "All" ? (
                  <>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${colorForSigned(row.delta4)}`}>
                      {fmtPct(row.delta4)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${colorForSigned(row.delta13)}`}>
                      {fmtPct(row.delta13)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${colorForSigned(row.delta26)}`}>
                      {fmtPct(row.delta26)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${colorForSigned(row.delta52)}`}>
                      {fmtPct(row.delta52)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Sparkline values={row.sparkline} />
                    </td>
                  </>
                ) : (
                  <td
                    className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${colorForSigned(singlePeriodDelta[period](row))}`}
                  >
                    {fmtPct(singlePeriodDelta[period](row))}
                  </td>
                )}
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${colorForRatio(row.tvRatio)}`}>
                  {row.tvRatio !== null ? `${row.tvRatio.toFixed(1)}×` : "—"}
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${colorForSigned(row.vsMa)}`}>
                  {fmtPct(row.vsMa)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{row.triggerCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedSector && (
        <ConstituentsPanel market={market} sector={selectedSector} onClose={() => setSelectedSector(null)} />
      )}
      </div>

      <div className="flex flex-wrap items-center gap-7 rounded-xl border border-border bg-panel p-4 text-sm">
        <div>
          <span className="text-gold-light">★</span> Focus sector = Stage 2, RS above 0, and RS improving over 4 and
          13 weeks
        </div>
        <div className="flex items-center gap-2">
          <Chip variant="yellow">Stage 1</Chip>
          <Chip variant="green">Stage 2</Chip>
          <Chip variant="amber">Stage 3</Chip>
          <Chip variant="red">Stage 4</Chip>
        </div>
        <div className="text-xs text-muted">
          Traded value: <span className="text-pos">1.5× or more</span> · <span className="text-warn">1.0–1.5×</span>{" "}
          · <span className="text-neg">below 1.0×</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/icons";
import { AddToButton } from "@/components/journal/AddToButton";
import { TradingViewLink } from "@/components/TradingViewLink";
import type { Market } from "@/lib/db/schema-types";
import { quoteKey, useQuotes } from "@/lib/use-quotes";

type SectorRsComparison = "leader" | "laggard" | "inline";

interface ConstituentRow {
  ticker: string;
  exchange: string | null;
  providerSymbol: string | null;
  mrs: number | null;
  rsRating: number | null;
  vsSectorRs: SectorRsComparison | null;
}

function vsSectorRsLabel(v: SectorRsComparison): string {
  return v === "leader" ? "Leader" : v === "laggard" ? "Laggard" : "In line";
}

function vsSectorRsClass(v: SectorRsComparison): string {
  return v === "leader" ? "text-pos" : v === "laggard" ? "text-neg" : "text-muted";
}

function fmt(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "Click a sector, see all its stocks" - the constituent list a Settings CSV upload created, each with a live quote. */
export function ConstituentsPanel({
  market,
  sector,
  onClose,
}: {
  market: Market;
  sector: string;
  onClose: () => void;
}) {
  const requestKey = `${market}:${sector}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: ConstituentRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sectors/constituents?market=${market}&sector=${encodeURIComponent(sector)}`)
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => {
        if (!cancelled) setLoaded({ key: requestKey, rows: data.rows ?? [] });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key: requestKey, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [market, sector, requestKey]);

  // A stale `loaded` from the previous sector shows as "loading" instead
  // of flashing the old sector's rows while the new fetch is in flight.
  const rows = loaded?.key === requestKey ? loaded.rows : null;

  const quotes = useQuotes((rows ?? []).map((r) => ({ market, symbol: r.providerSymbol })));

  return (
    <aside
      className="flex w-full flex-shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-panel-alt p-6 md:w-[420px]"
      aria-label={`${sector} constituents`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{sector}</h2>
          <div className="text-xs text-muted">
            {market === "IN" ? "India" : "US"} · {rows === null ? "loading…" : `${rows.length} stock${rows.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md p-1.5 text-muted hover:bg-panel hover:text-text"
        >
          <CloseIcon />
        </button>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted">Loading constituents…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          No constituents uploaded for this sector yet - add a CSV in Settings (Sector constituents) to see its
          stocks here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-strong">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Stock</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Live</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Day %</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">RS</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">vs Sector</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const quote = row.providerSymbol ? quotes.get(quoteKey(market, row.providerSymbol)) : undefined;
                const live = quote?.price ?? null;
                const dayPct =
                  live !== null && quote?.previousClose ? ((live - quote.previousClose) / quote.previousClose) * 100 : null;
                return (
                  <tr key={row.ticker} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">
                      {row.exchange ? (
                        <TradingViewLink exchange={row.exchange} ticker={row.ticker} />
                      ) : (
                        <span className="font-semibold">{row.ticker}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {row.providerSymbol === null ? (
                        <span className="text-xs text-muted">unavailable</span>
                      ) : live === null ? (
                        <span className="text-xs text-muted">…</span>
                      ) : (
                        fmt(live)
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {dayPct === null ? (
                        "—"
                      ) : (
                        <span className={dayPct >= 0 ? "text-pos" : "text-neg"}>
                          {dayPct >= 0 ? "▲ +" : "▼ "}
                          {dayPct.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      <span className={row.mrs !== null && row.mrs > 0 ? "text-pos" : row.mrs !== null ? "text-neg" : "text-muted"}>
                        {row.mrs !== null ? (row.mrs > 0 ? "+" : "") + row.mrs.toFixed(1) : "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                      {row.vsSectorRs === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className={vsSectorRsClass(row.vsSectorRs)}>{vsSectorRsLabel(row.vsSectorRs)}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <AddToButton market={market} ticker={row.ticker} alertId={null} defaultPrice={live} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}

import { WealthGrowthChartLazy } from "@/components/mutual-funds/WealthGrowthChartLazy";
import { formatMoney, formatPct } from "@/lib/format-money";
import { monthLabel } from "@/lib/month-utils";
import type { NetWorthView } from "@/lib/net-worth-stats";

function StatTile({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted" title={title}>
        {label}
      </div>
      <div className="mt-1 truncate text-[22px] font-semibold tabular-nums" title={value}>
        {value}
      </div>
    </div>
  );
}

/**
 * Consolidated "everything combined" view across every Mutual Fund
 * profile + NPS (DECISIONS.md) - plain Server Component, no interactive
 * entry forms here (read-only aggregation), so `WealthGrowthChartLazy`
 * (a client-boundary dynamic import) can be rendered directly the same
 * way the original Mutual Funds Overview did before Goal tracking forced
 * that one to become a client component for its own inline input.
 */
export function NetWorthDashboard({ view }: { view: NetWorthView }) {
  const { dashboard, breakdown, chartPoints } = view;

  if (dashboard.latestMonth === null) {
    return (
      <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
        No entries yet anywhere - add a month to Mutual Funds or NPS to see your combined net worth here.
      </div>
    );
  }

  return (
    <>
      <section className="rounded-xl border border-border bg-panel p-5 shadow-md" aria-label="Net worth summary">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Overview</h2>
          <span className="text-xs text-muted">As of {monthLabel(dashboard.latestMonth)}</span>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <StatTile label="Current value" value={formatMoney("IN", dashboard.currentValue)} />
            <StatTile label="Total invested" value={formatMoney("IN", dashboard.totalInvested)} />
            <div className="min-w-0">
              <div className="text-xs text-muted">Overall gain</div>
              <div
                className={`mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[22px] font-semibold tabular-nums ${dashboard.gainAbs >= 0 ? "text-pos" : "text-neg"}`}
              >
                <span>{formatMoney("IN", dashboard.gainAbs)}</span>
                <span className="min-w-0 truncate text-sm font-medium" title={`(${formatPct(dashboard.gainPct)})`}>
                  ({formatPct(dashboard.gainPct)})
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <div
                className="text-xs text-muted"
                title="Pooled XIRR across every Mutual Fund profile + NPS, solved from one combined cash-flow list - not an average of the individual XIRRs"
              >
                Combined XIRR
              </div>
              {dashboard.xirrPct === null ? (
                <div className="mt-1 text-[22px] font-semibold text-muted">—</div>
              ) : (
                <div
                  className={`mt-1 truncate text-[22px] font-semibold tabular-nums ${dashboard.xirrPct >= 0 ? "text-pos" : "text-neg"}`}
                  title={formatPct(dashboard.xirrPct)}
                >
                  {formatPct(dashboard.xirrPct)}
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Combined wealth growth</h3>
            <WealthGrowthChartLazy
              points={chartPoints.map((p) => ({ time: p.month, invested: p.invested, value: p.value, benchmark: null }))}
            />
          </div>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-border bg-panel">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Name</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Current value</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Invested</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Gain</th>
              <th
                className="whitespace-nowrap px-3 py-2.5 text-right font-semibold"
                title="Annualized return (XIRR), accounting for when each contribution and withdrawal happened"
              >
                XIRR
              </th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((row) => (
              <tr key={`${row.kind}-${row.name}`} className="border-b border-border/60">
                <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {row.name}
                  <span className="ml-1.5 text-xs text-muted">{row.kind === "mutual_fund" ? "Mutual Fund" : "NPS"}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatMoney("IN", row.currentValue)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatMoney("IN", row.invested)}</td>
                <td
                  className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${row.gainAbs >= 0 ? "text-pos" : "text-neg"}`}
                >
                  {formatMoney("IN", row.gainAbs)} <span className="text-xs">({formatPct(row.gainPct)})</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  {row.xirrPct === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className={row.xirrPct >= 0 ? "text-pos" : "text-neg"}>{formatPct(row.xirrPct)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

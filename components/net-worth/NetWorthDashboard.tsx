import Link from "next/link";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { formatMoney, formatPct } from "@/lib/format-money";
import { monthLabel } from "@/lib/month-utils";
import type { PeriodChange, SafeSwpSustainProjection } from "@/lib/mutual-fund-stats";
import { WealthGrowthChartLazy } from "@/components/mutual-funds/WealthGrowthChartLazy";
import type { NetWorthView } from "@/lib/net-worth-stats";

function safeSwpSustainText(projection: SafeSwpSustainProjection): string {
  switch (projection.status) {
    case "no_capital":
      return "";
    case "no_xirr":
      return "not enough history yet to project";
    case "invalid_rate":
      return "XIRR too negative to project";
    case "indefinite":
      return "sustains indefinitely";
    case "projected":
      return `sustains ~${projection.years.toFixed(1)} yrs`;
  }
}

/** One cell of the Value/P&L × vs-last-month/vs-last-year grid - no label of its own, the row/column headers carry that. */
function ChangeCell({ change }: { change: PeriodChange | null }) {
  if (change === null) {
    return <span className="text-muted">—</span>;
  }
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1 tabular-nums ${change.valueChangeAbs >= 0 ? "text-pos" : "text-neg"}`}>
      <span className="font-semibold">{formatMoney("IN", change.valueChangeAbs)}</span>
      <span className="text-xs font-medium text-muted">({formatPct(change.valueChangePct)})</span>
    </span>
  );
}

/**
 * Consolidated "everything combined" view across every Mutual Fund
 * profile + NPS (DECISIONS.md) - plain Server Component, no interactive
 * entry forms here (read-only aggregation), so `WealthGrowthChartLazy`
 * (a client-boundary dynamic import) can be rendered directly the same
 * way the original Mutual Funds Overview did before Goal tracking forced
 * that one to become a client component for its own inline input.
 *
 * Visual redesign (DECISIONS.md): the flat 9-tile grid this card grew into
 * (current value, invested, gain, XIRR, 4 change figures, Safe SWP) had no
 * hierarchy - every number the same size, same weight. Restructured into
 * tiers: a hero Current Value with its XIRR as a colored chip, a compact
 * secondary line for Invested/Gain, the 4 change figures collapsed into one
 * small Value-vs-P&L grid (they're naturally a 2x2 matrix - two time
 * periods crossed with two metrics - not four independent tiles), and Safe
 * SWP as its own clearly bounded sub-panel, matching the one the Change
 * grid already needed.
 */
export function NetWorthDashboard({ view }: { view: NetWorthView }) {
  const { dashboard, breakdown, chartPoints } = view;

  if (dashboard.latestMonth === null) {
    return <EmptyState>No entries yet anywhere - add a month to Mutual Funds or NPS to see your combined net worth here.</EmptyState>;
  }

  return (
    <>
      <section className="rounded-xl border border-border bg-panel p-5 shadow-md" aria-label="Net worth summary">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Overview</h2>
          <span className="text-xs text-muted">As of {monthLabel(dashboard.latestMonth)}</span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* Hero: the one number everything else supports */}
            <div className="min-w-0">
              <div className="text-xs text-muted">Current value</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="truncate text-[34px] font-semibold leading-none tabular-nums" title={formatMoney("IN", dashboard.currentValue)}>
                  {formatMoney("IN", dashboard.currentValue)}
                </span>
                {dashboard.xirrPct !== null && (
                  <Chip variant={dashboard.xirrPct >= 0 ? "green" : "red"}>
                    {formatPct(dashboard.xirrPct)} XIRR
                  </Chip>
                )}
              </div>
            </div>

            {/* Secondary: what built the hero number */}
            <div className="grid grid-cols-2 gap-4 border-t border-border pt-3.5">
              <div className="min-w-0">
                <div className="text-xs text-muted">Total invested</div>
                <div className="mt-0.5 truncate text-lg font-semibold tabular-nums" title={formatMoney("IN", dashboard.totalInvested)}>
                  {formatMoney("IN", dashboard.totalInvested)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted">Overall gain</div>
                <div
                  className={`mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-lg font-semibold tabular-nums ${dashboard.gainAbs >= 0 ? "text-pos" : "text-neg"}`}
                >
                  <span className="truncate">{formatMoney("IN", dashboard.gainAbs)}</span>
                  <span className="min-w-0 truncate text-xs font-medium text-muted">({formatPct(dashboard.gainPct)})</span>
                </div>
              </div>
            </div>

            {/* Change: a real table (not a mimicking grid) so the period x metric structure reads clearly */}
            <div className="rounded-lg border border-border-strong bg-panel-alt p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Change</div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="pb-1.5 text-left text-xs font-medium text-muted"></th>
                    <th
                      className="pb-1.5 pl-3 text-right text-xs font-medium text-muted"
                      title="Raw portfolio value change - includes new contributions, not just investment performance"
                    >
                      Value
                    </th>
                    <th
                      className="pb-1.5 pl-3 text-right text-xs font-medium text-muted"
                      title="Profit/loss change only - isolates real investment performance from new contributions"
                    >
                      P&amp;L
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/60">
                    <td className="py-1.5 text-left text-xs text-muted">vs last month</td>
                    <td className="py-1.5 pl-3 text-right">
                      <ChangeCell change={dashboard.vsLastMonth} />
                    </td>
                    <td className="py-1.5 pl-3 text-right">
                      <ChangeCell change={dashboard.gainVsLastMonth} />
                    </td>
                  </tr>
                  <tr className="border-t border-border/60">
                    <td className="py-1.5 text-left text-xs text-muted">vs last year</td>
                    <td className="py-1.5 pl-3 text-right">
                      <ChangeCell change={dashboard.vsLastYear} />
                    </td>
                    <td className="py-1.5 pl-3 text-right">
                      <ChangeCell change={dashboard.gainVsLastYear} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Safe SWP: its own sub-panel, same visual tier as Change */}
            <div className="rounded-lg border border-border-strong bg-panel-alt p-3">
              <div
                className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted"
                title="The classic 4% rule on your combined net worth. Sustain estimate: freezes that amount as a fixed yearly withdrawal and projects it forward at your Combined XIRR."
              >
                Safe SWP*
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="truncate text-lg font-semibold tabular-nums">{formatMoney("IN", dashboard.safeSwpMonthly)}/mo</span>
                <span className="text-xs text-muted">{safeSwpSustainText(dashboard.safeSwpSustain)}</span>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Combined wealth growth</h3>
            <WealthGrowthChartLazy
              points={chartPoints.map((p) => ({ time: p.month, invested: p.invested, value: p.value, benchmark: null }))}
            />
          </div>
        </div>

        <p className="mt-4 text-xs text-muted">
          * Safe SWP: the classic &ldquo;4% rule&rdquo; - 4% of the combined current value per year, divided into a
          monthly amount. The sustain estimate freezes that amount as a fixed yearly withdrawal and projects it
          forward at the Combined XIRR above - it is not the same recalculated-every-month figure the 4% rule itself
          uses, since that version never technically reaches zero.
        </p>
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
                  <Link href={row.href} className="hover:text-gold-light hover:underline">
                    {row.name}
                  </Link>
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

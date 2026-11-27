import { formatMoney, formatPct } from "@/lib/format-money";
import { computeBenchmarkSeries, monthLabel } from "@/lib/mutual-fund-stats";
import type { MutualFundDashboard as Dashboard, MutualFundEntryView } from "@/lib/mutual-fund-stats";
import { ChangeLine } from "@/components/ChangeLine";
import { GoalTracker } from "./GoalTracker";
import { WealthGrowthChartLazy } from "./WealthGrowthChartLazy";

export function MutualFundDashboard({
  dashboard,
  rows,
  profileId,
  goalAmount,
}: {
  dashboard: Dashboard;
  rows: MutualFundEntryView[];
  profileId: string;
  goalAmount: number | null;
}) {
  if (dashboard.latestMonth === null) {
    return (
      <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
        No entries yet - add your first month below to start tracking.
      </div>
    );
  }

  // `computeBenchmarkSeries` re-sorts by month ascending internally, same as
  // `rows` already is (from `buildMutualFundView`), so the two line up 1:1 by index.
  const benchmarkSeries = computeBenchmarkSeries(rows.map((r) => r.entry));
  const chartPoints = rows.map((r, i) => ({
    time: r.entry.month,
    invested: r.cumulativeInvested,
    value: r.entry.current_value,
    benchmark: benchmarkSeries[i]?.value ?? null,
  }));

  return (
    <section
      className="sticky top-0 z-10 rounded-xl border border-border bg-panel p-5 shadow-md"
      aria-label="Mutual fund summary"
    >
      {/* bg-bg strip fills the gap above the sticky card so it doesn't show page content bleeding through while pinned */}
      <div className="absolute inset-x-0 bottom-full h-4 bg-bg" aria-hidden="true" />
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Overview</h2>
        <span className="text-xs text-muted">As of {monthLabel(dashboard.latestMonth)}</span>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <div className="min-w-0">
            <div className="text-xs text-muted">Current value</div>
            <div className="mt-1 truncate text-[22px] font-semibold tabular-nums" title={formatMoney("IN", dashboard.currentValue!)}>
              {formatMoney("IN", dashboard.currentValue!)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted">Total invested</div>
            <div className="mt-1 truncate text-[22px] font-semibold tabular-nums" title={formatMoney("IN", dashboard.totalInvested!)}>
              {formatMoney("IN", dashboard.totalInvested!)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted">Overall gain</div>
            <div
              className={`mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[22px] font-semibold tabular-nums ${dashboard.gainAbs! >= 0 ? "text-pos" : "text-neg"}`}
            >
              <span>{formatMoney("IN", dashboard.gainAbs!)}</span>
              <span className="min-w-0 truncate text-sm font-medium" title={`(${formatPct(dashboard.gainPct)})`}>
                ({formatPct(dashboard.gainPct)})
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted" title="Annualized return (XIRR), accounting for when each contribution and withdrawal happened">
              XIRR
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
          <div className="min-w-0">
            <div
              className="text-xs text-muted"
              title="Safe SWP: the classic 4% rule - 4% of the current portfolio value per year, as a monthly amount"
            >
              Safe SWP*
            </div>
            <div className="mt-1 truncate text-[22px] font-semibold tabular-nums">
              {formatMoney("IN", dashboard.safeSwpMonthly!)}/mo
            </div>
          </div>
          <ChangeLine label="vs last month" change={dashboard.vsLastMonth} market="IN" />
          <ChangeLine label="vs same month last year" change={dashboard.vsLastYear} market="IN" />
          <div className="col-span-2 sm:col-span-3">
            <GoalTracker
              profileId={profileId}
              goalAmount={goalAmount}
              currentValue={dashboard.currentValue!}
              xirrPct={dashboard.xirrPct}
            />
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Wealth growth</h3>
          <WealthGrowthChartLazy points={chartPoints} />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        * Safe SWP: the classic &ldquo;4% rule&rdquo; - 4% of the current portfolio value per year, divided into a
        monthly amount. Recalculated fresh against the latest value, not a fixed plan.
      </p>
    </section>
  );
}

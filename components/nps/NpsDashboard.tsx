import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { formatMoney, formatPct } from "@/lib/format-money";
import { monthLabel } from "@/lib/nps-stats";
import type { NpsDashboard as Dashboard, NpsEntryView } from "@/lib/nps-stats";
import { ChangeLine } from "@/components/ChangeLine";
import { RetirementPensionEstimator } from "./RetirementPensionEstimator";
import { WealthGrowthChartLazy } from "./WealthGrowthChartLazy";

export function NpsDashboard({ dashboard, rows }: { dashboard: Dashboard; rows: NpsEntryView[] }) {
  if (dashboard.latestMonth === null) {
    return <EmptyState>No entries yet - add your first month below to start tracking.</EmptyState>;
  }

  const chartPoints = rows.map((r) => ({
    time: r.entry.month,
    invested: r.cumulativeInvested,
    value: r.entry.current_value,
  }));

  return (
    <section className="rounded-xl border border-border bg-panel p-5 shadow-md" aria-label="NPS summary">
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
              <span
                className="truncate text-[34px] font-semibold leading-none tabular-nums"
                title={formatMoney("IN", dashboard.currentValue!)}
              >
                {formatMoney("IN", dashboard.currentValue!)}
              </span>
              {dashboard.xirrPct !== null && (
                <Chip variant={dashboard.xirrPct >= 0 ? "green" : "red"}>{formatPct(dashboard.xirrPct)} XIRR</Chip>
              )}
            </div>
          </div>

          {/* Secondary: what built the hero number */}
          <div className="grid grid-cols-2 gap-4 border-t border-border pt-3.5">
            <div className="min-w-0">
              <div className="text-xs text-muted">Total invested</div>
              <div className="mt-0.5 truncate text-lg font-semibold tabular-nums" title={formatMoney("IN", dashboard.totalInvested!)}>
                {formatMoney("IN", dashboard.totalInvested!)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted">Overall gain</div>
              <div
                className={`mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-lg font-semibold tabular-nums ${dashboard.gainAbs! >= 0 ? "text-pos" : "text-neg"}`}
              >
                <span className="truncate">{formatMoney("IN", dashboard.gainAbs!)}</span>
                <span className="min-w-0 truncate text-xs font-medium text-muted">({formatPct(dashboard.gainPct)})</span>
              </div>
            </div>
          </div>

          {/* Change: its own small sub-panel instead of two tiles in the flat grid */}
          <div className="rounded-lg border border-border-strong bg-panel-alt p-3">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Change</div>
            <div className="grid grid-cols-2 gap-3">
              <ChangeLine label="vs last month" change={dashboard.vsLastMonth} market="IN" />
              <ChangeLine label="vs same month last year" change={dashboard.vsLastYear} market="IN" />
            </div>
          </div>

          {/* Safe SWP: its own sub-panel, same visual tier as Change */}
          <div className="rounded-lg border border-border-strong bg-panel-alt p-3">
            <div
              className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted"
              title="Safe SWP: the classic 4% rule - 4% of the current portfolio value per year, as a monthly amount"
            >
              Safe SWP*
            </div>
            <div className="truncate text-lg font-semibold tabular-nums">{formatMoney("IN", dashboard.safeSwpMonthly!)}/mo</div>
          </div>

          <RetirementPensionEstimator currentValue={dashboard.currentValue!} />
        </div>
        <div className="min-w-0">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Wealth growth</h3>
          <WealthGrowthChartLazy points={chartPoints} />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">
        * Safe SWP: the classic &ldquo;4% rule&rdquo; - 4% of the current portfolio value per year, divided into a
        monthly amount. Recalculated fresh against the latest value, not a fixed plan.
      </p>
    </section>
  );
}

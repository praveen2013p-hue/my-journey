import { formatMoney, formatPct } from "@/lib/format-money";
import { monthLabel } from "@/lib/mutual-fund-stats";
import type { MutualFundDashboard as Dashboard, PeriodChange } from "@/lib/mutual-fund-stats";

function ChangeLine({ label, change }: { label: string; change: PeriodChange | null }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      {change === null ? (
        <div className="mt-1 text-sm text-muted">—</div>
      ) : (
        <div
          className={`mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[17px] font-semibold tabular-nums ${change.valueChangeAbs >= 0 ? "text-pos" : "text-neg"}`}
        >
          <span>{formatMoney("IN", change.valueChangeAbs)}</span>
          <span className="min-w-0 truncate text-sm font-medium" title={`(${formatPct(change.valueChangePct)})`}>
            ({formatPct(change.valueChangePct)})
          </span>
        </div>
      )}
    </div>
  );
}

export function MutualFundDashboard({ dashboard }: { dashboard: Dashboard }) {
  if (dashboard.latestMonth === null) {
    return (
      <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
        No entries yet - add your first month below to start tracking.
      </div>
    );
  }

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
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
        <div className="min-w-0">
          <div className="text-xs text-muted">Total invested</div>
          <div className="mt-1 truncate text-[22px] font-semibold tabular-nums" title={formatMoney("IN", dashboard.totalInvested!)}>
            {formatMoney("IN", dashboard.totalInvested!)}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted">Current value</div>
          <div className="mt-1 truncate text-[22px] font-semibold tabular-nums" title={formatMoney("IN", dashboard.currentValue!)}>
            {formatMoney("IN", dashboard.currentValue!)}
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
        <ChangeLine label="vs last month" change={dashboard.vsLastMonth} />
        <ChangeLine label="vs same month last year" change={dashboard.vsLastYear} />
      </div>
    </section>
  );
}

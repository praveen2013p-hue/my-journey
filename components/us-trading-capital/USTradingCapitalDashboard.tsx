import { formatMoney, formatPct } from "@/lib/format-money";
import { monthLabel } from "@/lib/us-trading-capital-stats";
import type {
  UsTradingCapitalDashboard as Dashboard,
  UsTradingCapitalEntryView,
  PeriodChange,
} from "@/lib/us-trading-capital-stats";
import { WealthGrowthChartLazy } from "./WealthGrowthChartLazy";

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
          <span>{formatMoney("US", change.valueChangeAbs)}</span>
          <span className="min-w-0 truncate text-sm font-medium" title={`(${formatPct(change.valueChangePct)})`}>
            ({formatPct(change.valueChangePct)})
          </span>
        </div>
      )}
    </div>
  );
}

function realReturnPrompt(reason: "missing_deposit_data" | "missing_current_rate"): string {
  return reason === "missing_deposit_data"
    ? "Add the INR amount or FX rate for every deposit to see your real (₹) return."
    : "Add today's USD/INR rate to see your real return.";
}

export function USTradingCapitalDashboard({
  dashboard,
  rows,
}: {
  dashboard: Dashboard;
  rows: UsTradingCapitalEntryView[];
}) {
  if (dashboard.latestMonth === null) {
    return (
      <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
        No entries yet - add your first month below to start tracking.
      </div>
    );
  }

  const chartPoints = rows.map((r) => ({
    time: r.entry.month,
    invested: r.cumulativeInvested,
    value: r.entry.current_value,
  }));

  return (
    <section
      className="sticky top-0 z-10 rounded-xl border border-border bg-panel p-5 shadow-md"
      aria-label="US Trading Capital summary"
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
            <div className="mt-1 truncate text-[22px] font-semibold tabular-nums" title={formatMoney("US", dashboard.currentValue!)}>
              {formatMoney("US", dashboard.currentValue!)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted">Total invested</div>
            <div className="mt-1 truncate text-[22px] font-semibold tabular-nums" title={formatMoney("US", dashboard.totalInvested!)}>
              {formatMoney("US", dashboard.totalInvested!)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted">Overall gain</div>
            <div
              className={`mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[22px] font-semibold tabular-nums ${dashboard.gainAbs! >= 0 ? "text-pos" : "text-neg"}`}
            >
              <span>{formatMoney("US", dashboard.gainAbs!)}</span>
              <span className="min-w-0 truncate text-sm font-medium" title={`(${formatPct(dashboard.gainPct)})`}>
                ({formatPct(dashboard.gainPct)})
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div
              className="text-xs text-muted"
              title="Annualized return on your USD capital alone - ignores what the rupee did after each deposit converted"
            >
              Annualized Return (USD)
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
          <div className="min-w-0 sm:col-span-2">
            <div
              className="text-xs text-muted"
              title="FX-adjusted annualized return, in rupees - what this capital is actually worth today vs what was actually paid, using each deposit's own conversion rate"
            >
              Real Return (₹, FX-adjusted)
            </div>
            {dashboard.realReturnPct === null ? (
              <div className="mt-1 text-sm text-muted">
                {dashboard.realReturnBlockedReason ? realReturnPrompt(dashboard.realReturnBlockedReason) : "—"}
              </div>
            ) : (
              <div
                className={`mt-1 truncate text-[22px] font-semibold tabular-nums ${dashboard.realReturnPct >= 0 ? "text-pos" : "text-neg"}`}
                title={formatPct(dashboard.realReturnPct)}
              >
                {formatPct(dashboard.realReturnPct)}
              </div>
            )}
          </div>
          <ChangeLine label="vs last month" change={dashboard.vsLastMonth} />
          <ChangeLine label="vs same month last year" change={dashboard.vsLastYear} />
        </div>
        <div className="min-w-0">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Capital growth</h3>
          <WealthGrowthChartLazy points={chartPoints} />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Annualized Return (USD) ignores rupee movement after conversion. Real Return reflects what the capital is
        actually worth in rupees today vs what was actually paid - each deposit uses its own historical conversion
        rate, and the current balance uses today&apos;s rate.
      </p>
    </section>
  );
}

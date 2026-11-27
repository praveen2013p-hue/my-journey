import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { formatMoney, formatPct } from "@/lib/format-money";
import { monthLabel } from "@/lib/us-trading-capital-stats";
import type { UsTradingCapitalDashboard as Dashboard, UsTradingCapitalEntryView } from "@/lib/us-trading-capital-stats";
import { ChangeLine } from "@/components/ChangeLine";
import { WealthGrowthChartLazy } from "./WealthGrowthChartLazy";

function realReturnPrompt(reason: "missing_deposit_data" | "missing_withdrawal_data" | "missing_current_rate"): string {
  if (reason === "missing_deposit_data") return "Add the INR amount or FX rate for every deposit to see your real (₹) return.";
  if (reason === "missing_withdrawal_data") return "Add the FX rate for this month's withdrawal to see your real return.";
  return "Add today's USD/INR rate to see your real return.";
}

export function USTradingCapitalDashboard({
  dashboard,
  rows,
}: {
  dashboard: Dashboard;
  rows: UsTradingCapitalEntryView[];
}) {
  if (dashboard.latestMonth === null) {
    return <EmptyState>No entries yet - add your first month below to start tracking.</EmptyState>;
  }

  const chartPoints = rows.map((r) => ({
    time: r.entry.month,
    invested: r.cumulativeInvested,
    value: r.entry.current_value,
  }));

  return (
    <section className="rounded-xl border border-border bg-panel p-5 shadow-md" aria-label="US Trading Capital summary">
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
                title={formatMoney("US", dashboard.currentValue!)}
              >
                {formatMoney("US", dashboard.currentValue!)}
              </span>
              {dashboard.xirrPct !== null && (
                <Chip variant={dashboard.xirrPct >= 0 ? "green" : "red"}>{formatPct(dashboard.xirrPct)} USD return</Chip>
              )}
            </div>
          </div>

          {/* Secondary: what built the hero number */}
          <div className="grid grid-cols-2 gap-4 border-t border-border pt-3.5">
            <div className="min-w-0">
              <div className="text-xs text-muted">Total invested</div>
              <div className="mt-0.5 truncate text-lg font-semibold tabular-nums" title={formatMoney("US", dashboard.totalInvested!)}>
                {formatMoney("US", dashboard.totalInvested!)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted">Overall gain</div>
              <div
                className={`mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-lg font-semibold tabular-nums ${dashboard.gainAbs! >= 0 ? "text-pos" : "text-neg"}`}
              >
                <span className="truncate">{formatMoney("US", dashboard.gainAbs!)}</span>
                <span className="min-w-0 truncate text-xs font-medium text-muted">({formatPct(dashboard.gainPct)})</span>
              </div>
            </div>
          </div>

          {/* Real Return: its own sub-panel - the headline rupee-terms number, and its explanatory blocked states need room */}
          <div className="rounded-lg border border-border-strong bg-panel-alt p-3">
            <div
              className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted"
              title="FX-adjusted annualized return, in rupees - what this capital is actually worth today vs what was actually paid, using each deposit's own conversion rate"
            >
              Real Return (₹, FX-adjusted)
            </div>
            {dashboard.realReturnPct === null ? (
              <div className="text-sm text-muted">
                {dashboard.realReturnBlockedReason ? realReturnPrompt(dashboard.realReturnBlockedReason) : "—"}
              </div>
            ) : (
              <div
                className={`truncate text-lg font-semibold tabular-nums ${dashboard.realReturnPct >= 0 ? "text-pos" : "text-neg"}`}
                title={formatPct(dashboard.realReturnPct)}
              >
                {formatPct(dashboard.realReturnPct)}
              </div>
            )}
          </div>

          {/* Change: its own small sub-panel instead of two tiles in the flat grid */}
          <div className="rounded-lg border border-border-strong bg-panel-alt p-3">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Change</div>
            <div className="grid grid-cols-2 gap-3">
              <ChangeLine label="vs last month" change={dashboard.vsLastMonth} market="US" />
              <ChangeLine label="vs same month last year" change={dashboard.vsLastYear} market="US" />
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Capital growth</h3>
          <WealthGrowthChartLazy points={chartPoints} />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">
        Annualized Return (USD) ignores rupee movement after conversion. Real Return reflects what the capital is
        actually worth in rupees today vs what was actually paid - each deposit uses its own historical conversion
        rate, and the current balance uses today&apos;s rate.
      </p>
    </section>
  );
}

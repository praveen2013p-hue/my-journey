"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, formatPct } from "@/lib/format-money";
import { computeGoalProjection, monthLabel } from "@/lib/mutual-fund-stats";
import type { MutualFundDashboard as Dashboard, MutualFundEntryView, PeriodChange } from "@/lib/mutual-fund-stats";
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
          <span>{formatMoney("IN", change.valueChangeAbs)}</span>
          <span className="min-w-0 truncate text-sm font-medium" title={`(${formatPct(change.valueChangePct)})`}>
            ({formatPct(change.valueChangePct)})
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Target-corpus progress + projected time-to-goal, DECISIONS.md. The
 * projection itself (`computeGoalProjection`, lib/mutual-fund-stats.ts)
 * is the conservative, no-guessing math; this component is just its
 * states rendered - including "no goal set yet," which gets an inline
 * input right here rather than a separate Settings round-trip.
 */
function GoalTracker({
  profileId,
  goalAmount,
  currentValue,
  xirrPct,
}: {
  profileId: string;
  goalAmount: number | null;
  currentValue: number;
  xirrPct: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(goalAmount === null);
  const [text, setText] = useState(goalAmount !== null ? String(goalAmount) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(amount: number | null) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/mutual-fund-profiles/${profileId}/goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal_amount: amount }),
      });
      if (!res.ok) throw new Error("Couldn't save goal.");
      router.refresh();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a target amount greater than 0.");
      return;
    }
    void save(amount);
  }

  if (editing) {
    return (
      <div className="min-w-0 rounded-lg border border-border-strong bg-panel-alt p-3 sm:col-span-3">
        <div className="mb-1.5 text-xs text-muted">{goalAmount === null ? "Set a target corpus" : "Edit target corpus"}</div>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            step="any"
            min="0"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. 50000000"
            aria-label="Target corpus"
            className="min-h-[36px] w-40 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
          />
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[36px] rounded-md border border-gold bg-gold px-2.5 text-sm font-semibold text-bg hover:bg-gold-hover disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save goal"}
          </button>
          {goalAmount !== null && (
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:text-text">
              Cancel
            </button>
          )}
          {error && <span className="text-xs text-neg">{error}</span>}
        </form>
      </div>
    );
  }

  const progressPct = (currentValue / goalAmount!) * 100;
  const projection = computeGoalProjection(currentValue, goalAmount!, xirrPct);

  let timelineText: string;
  if (projection.status === "reached") {
    timelineText = "Goal reached.";
  } else if (projection.status === "no_xirr") {
    timelineText = "Not enough history yet to project a timeline.";
  } else if (projection.status === "no_growth") {
    timelineText = "Current XIRR doesn't project forward growth - no timeline to show.";
  } else {
    const years = projection.months / 12;
    timelineText = `~${Math.ceil(projection.months)} months (${years.toFixed(1)} yrs) to go at the current XIRR`;
  }

  return (
    <div className="min-w-0 rounded-lg border border-border bg-panel-alt p-3 sm:col-span-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-xs text-muted">
          Goal: <span className="font-semibold text-text">{formatMoney("IN", goalAmount!)}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setText(String(goalAmount));
            setError(null);
            setEditing(true);
          }}
          className="text-xs text-muted hover:text-text"
        >
          Edit
        </button>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-field">
        <div
          className={`h-full rounded-full ${progressPct >= 100 ? "bg-pos" : "bg-gold"}`}
          style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
        <span>{formatPct(progressPct)} of goal</span>
        <span>{timelineText}</span>
      </div>
    </div>
  );
}

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

  const chartPoints = rows.map((r) => ({
    time: r.entry.month,
    invested: r.cumulativeInvested,
    value: r.entry.current_value,
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
          <ChangeLine label="vs last month" change={dashboard.vsLastMonth} />
          <ChangeLine label="vs same month last year" change={dashboard.vsLastYear} />
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

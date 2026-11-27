"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, formatPct } from "@/lib/format-money";
import { computeGoalProjection } from "@/lib/mutual-fund-stats";

/**
 * Target-corpus progress + projected time-to-goal, DECISIONS.md. The
 * projection itself (`computeGoalProjection`, lib/mutual-fund-stats.ts)
 * is the conservative, no-guessing math; this component is just its
 * states rendered - including "no goal set yet," which gets an inline
 * input right here rather than a separate Settings round-trip.
 *
 * Split out of MutualFundDashboard.tsx (DECISIONS.md, performance pass)
 * so the static Overview card above it can be a Server Component - this
 * is the only piece of that card that actually needs client state.
 */
export function GoalTracker({
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
  const [syncedProfileId, setSyncedProfileId] = useState(profileId);
  const [editing, setEditing] = useState(goalAmount === null);
  const [text, setText] = useState(goalAmount !== null ? String(goalAmount) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switching Mutual Fund profiles is a same-route, search-param-only
  // navigation (?profile=...), so this component isn't remounted - without
  // this, the editor would keep showing the PREVIOUS profile's goal-editor
  // state (open/closed, typed text) under the newly-selected profile.
  // Adjusted during render (React's documented pattern for this), not in an
  // effect - keyed on profileId only: a save() on the SAME profile already
  // manages editing/text itself, and re-running this on every goalAmount
  // change (including the one save() itself triggers via router.refresh())
  // would fight that.
  if (profileId !== syncedProfileId) {
    setSyncedProfileId(profileId);
    setEditing(goalAmount === null);
    setText(goalAmount !== null ? String(goalAmount) : "");
    setError(null);
  }

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
      <div className="min-w-0 rounded-lg border border-border-strong bg-panel-alt p-3">
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
  } else if (projection.status === "no_capital") {
    timelineText = "No capital currently invested - no timeline to project.";
  } else {
    const years = projection.months / 12;
    timelineText = `~${Math.ceil(projection.months)} months (${years.toFixed(1)} yrs) to go at the current XIRR`;
  }

  return (
    <div className="min-w-0 rounded-lg border border-border bg-panel-alt p-3">
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

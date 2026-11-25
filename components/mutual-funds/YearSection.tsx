"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, formatPct } from "@/lib/format-money";
import { monthLabel } from "@/lib/mutual-fund-stats";
import type { MutualFundEntryView, MutualFundYearGroup } from "@/lib/mutual-fund-stats";
import { NegativeAmountNoteButton } from "./NegativeAmountNoteButton";

function EditEntryForm({ row, onDone }: { row: MutualFundEntryView; onDone: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountAddedText, setAmountAddedText] = useState(String(row.entry.amount_added));
  const [negativeAmountNote, setNegativeAmountNote] = useState(row.entry.negative_amount_note ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const amountAdded = Number(data.get("amount_added"));
    const withdrawalRaw = String(data.get("withdrawal") ?? "").trim();
    const plannedAmountRaw = String(data.get("planned_amount") ?? "").trim();
    const currentValue = Number(data.get("current_value"));
    const notes = String(data.get("notes") ?? "").trim();

    if (!Number.isFinite(amountAdded) || !Number.isFinite(currentValue) || currentValue < 0) {
      setError("Enter valid numbers.");
      return;
    }
    const withdrawal = withdrawalRaw === "" ? 0 : Number(withdrawalRaw);
    const plannedAmount = plannedAmountRaw === "" ? null : Number(plannedAmountRaw);
    if (!Number.isFinite(withdrawal) || withdrawal < 0 || (plannedAmount !== null && !Number.isFinite(plannedAmount))) {
      setError("Enter valid numbers.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/mutual-funds/${row.entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_added: amountAdded,
          withdrawal,
          planned_amount: plannedAmount,
          current_value: currentValue,
          notes: notes || null,
          negative_amount_note: amountAdded < 0 ? negativeAmountNote.trim() || null : null,
        }),
      });
      if (!res.ok) throw new Error("Couldn't save changes.");
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border-strong bg-panel-alt p-2.5"
    >
      <span className="inline-flex items-center">
        <input
          type="number"
          step="any"
          name="amount_added"
          required
          value={amountAddedText}
          onChange={(e) => setAmountAddedText(e.target.value)}
          aria-label="Amount added"
          placeholder="Amount added"
          className={`min-h-[36px] w-32 rounded-md border bg-field px-2 text-sm ${
            Number(amountAddedText) < 0 ? "border-neg-border text-neg" : "border-border-strong text-text"
          }`}
        />
        {Number(amountAddedText) < 0 && (
          <NegativeAmountNoteButton
            initialValue={negativeAmountNote}
            hasNote={!!negativeAmountNote}
            onSave={setNegativeAmountNote}
          />
        )}
      </span>
      <input
        type="number"
        step="any"
        min="0"
        name="planned_amount"
        defaultValue={row.entry.planned_amount ?? ""}
        aria-label="Planned amount"
        placeholder="Planned (optional)"
        className="min-h-[36px] w-32 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
      />
      <input
        type="number"
        step="any"
        min="0"
        name="withdrawal"
        defaultValue={row.entry.withdrawal}
        aria-label="Withdrawal"
        placeholder="Withdrawn"
        className="min-h-[36px] w-32 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
      />
      <input
        type="number"
        step="any"
        min="0"
        name="current_value"
        required
        defaultValue={row.entry.current_value}
        aria-label="Current value"
        placeholder="Current value"
        className="min-h-[36px] w-32 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
      />
      <input
        type="text"
        name="notes"
        defaultValue={row.entry.notes ?? ""}
        aria-label="Notes"
        placeholder="Notes (optional)"
        className="min-h-[36px] w-40 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
      />
      <button
        type="submit"
        disabled={submitting}
        className="min-h-[36px] rounded-md border border-gold bg-gold px-2.5 text-sm font-semibold text-bg hover:bg-gold-hover disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={onDone} className="text-xs text-muted hover:text-text">
        Cancel
      </button>
      {error && <span className="text-xs text-neg">{error}</span>}
    </form>
  );
}

export function YearRows({ rows }: { rows: MutualFundEntryView[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this month's entry? This can't be undone.")) return;
    await fetch(`/api/mutual-funds/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Month</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">SIP Amount</th>
            <th
              className="whitespace-nowrap px-3 py-2.5 text-right font-semibold"
              title="Total of your own money invested so far - never reduced by a withdrawal"
            >
              Invested
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Valuation</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold" title="Required amount to be invested, as per your plan">
              Planned
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Withdrawn</th>
            <th
              className="whitespace-nowrap px-3 py-2.5 text-right font-semibold"
              title="How much the Gain moved compared to the previous calendar month"
            >
              Change
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Gain</th>
            <th
              className="whitespace-nowrap px-3 py-2.5 text-right font-semibold"
              title="Annualized return (XIRR) as of this month, using every contribution/withdrawal to date"
            >
              XIRR
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Notes</th>
            <th
              className="whitespace-nowrap px-3 py-2.5 text-right font-semibold"
              title="Safe SWP @ 4% of the portfolio, as a monthly amount - see the note below the table"
            >
              Safe SWP*
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((row) => [
            <tr key={row.entry.id} className="border-b border-border/60">
              <td className="whitespace-nowrap px-3 py-2.5 font-medium">{monthLabel(row.entry.month)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                <span className={row.entry.amount_added < 0 ? "text-neg" : undefined}>
                  {formatMoney("IN", row.entry.amount_added)}
                </span>
                {row.entry.amount_added < 0 && (
                  <NegativeAmountNoteButton
                    initialValue={row.entry.negative_amount_note ?? ""}
                    hasNote={!!row.entry.negative_amount_note}
                    onSave={async (text) => {
                      await fetch(`/api/mutual-funds/${row.entry.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ negative_amount_note: text || null }),
                      });
                      router.refresh();
                    }}
                  />
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {formatMoney("IN", row.cumulativeAdded)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {formatMoney("IN", row.cumulativeInvested)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {row.entry.planned_amount === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className={row.entry.amount_added >= row.entry.planned_amount ? "text-pos" : "text-neg"}>
                    {formatMoney("IN", row.entry.planned_amount)}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {row.entry.withdrawal > 0 ? formatMoney("IN", row.entry.withdrawal) : <span className="text-muted">—</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {row.pnlChangeAbs === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className={row.pnlChangeAbs >= 0 ? "text-pos" : "text-neg"}>
                    {row.pnlChangeAbs >= 0 ? "▲ " : "▼ "}
                    {formatMoney("IN", row.pnlChangeAbs)}
                  </span>
                )}
              </td>
              <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${row.gainAbs >= 0 ? "text-pos" : "text-neg"}`}>
                {formatMoney("IN", row.gainAbs)} <span className="text-xs">({formatPct(row.gainPct)})</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {row.xirrPct === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className={row.xirrPct >= 0 ? "text-pos" : "text-neg"}>{formatPct(row.xirrPct)}</span>
                )}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-xs text-muted">{row.entry.notes ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {row.safeSwpMonthly === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <>{formatMoney("IN", row.safeSwpMonthly)}/mo</>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(editingId === row.entry.id ? null : row.entry.id)}
                    className="rounded-md border border-border-strong bg-panel-alt px-2 py-1 text-xs font-medium hover:bg-panel"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(row.entry.id)}
                    className="rounded-md border border-border-strong bg-panel-alt px-2 py-1 text-xs font-medium text-neg hover:bg-panel"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>,
            editingId === row.entry.id ? (
              <tr key={`${row.entry.id}-edit`} className="border-b border-border/60">
                <td colSpan={13} className="px-3 py-2.5">
                  <EditEntryForm row={row} onDone={() => setEditingId(null)} />
                </td>
              </tr>
            ) : null,
          ])}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        Planned: <span className="text-pos">green</span> when that month&apos;s SIP Amount met or exceeded the plan,{" "}
        <span className="text-neg">red</span> when it fell short.
      </p>
      <p className="mt-1 text-xs text-muted">
        * Safe SWP: the level monthly withdrawal that runs that month&apos;s portfolio down to exactly zero by age
        90 (nothing left as legacy), assuming it keeps earning that month&apos;s own XIRR the whole way, adjusted for
        6% assumed long-run inflation. Needs your birth year set in Settings - shows &ldquo;—&rdquo; until then.
      </p>
    </div>
  );
}

/** One year, collapsed by default - click to expand its month-by-month entries. */
export function YearSection({ group, defaultOpen }: { group: MutualFundYearGroup; defaultOpen: boolean }) {
  return (
    <details className="group rounded-xl border border-border bg-panel" open={defaultOpen}>
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold">{group.year}</span>
          <span className="text-xs text-muted">
            {group.rows.length} entr{group.rows.length === 1 ? "y" : "ies"}
          </span>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <span className="text-muted">
            Added <span className="font-semibold text-text">{formatMoney("IN", group.yearInvested)}</span>
          </span>
          <span className="text-muted">
            Year-end value <span className="font-semibold text-text">{formatMoney("IN", group.yearEndValue)}</span>
          </span>
        </div>
      </summary>
      <div className="border-t border-border p-3">
        <YearRows rows={group.rows} />
      </div>
    </details>
  );
}

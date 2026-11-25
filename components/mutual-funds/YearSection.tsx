"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, formatPct } from "@/lib/format-money";
import { monthLabel } from "@/lib/mutual-fund-stats";
import type { MutualFundEntryView, MutualFundYearGroup } from "@/lib/mutual-fund-stats";

function EditEntryForm({ row, onDone }: { row: MutualFundEntryView; onDone: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const amountAdded = Number(data.get("amount_added"));
    const currentValue = Number(data.get("current_value"));
    const notes = String(data.get("notes") ?? "").trim();

    if (!Number.isFinite(amountAdded) || !Number.isFinite(currentValue) || currentValue < 0) {
      setError("Enter valid numbers.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/mutual-funds/${row.entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_added: amountAdded, current_value: currentValue, notes: notes || null }),
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
      <input
        type="number"
        step="any"
        min="0"
        name="amount_added"
        required
        defaultValue={row.entry.amount_added}
        aria-label="Amount added"
        placeholder="Amount added"
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

function YearRows({ rows }: { rows: MutualFundEntryView[] }) {
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
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Added</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Invested to date</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Current value</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Gain</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Notes</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((row) => [
            <tr key={row.entry.id} className="border-b border-border/60">
              <td className="whitespace-nowrap px-3 py-2.5 font-medium">{monthLabel(row.entry.month)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {formatMoney("IN", row.entry.amount_added)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {formatMoney("IN", row.cumulativeInvested)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {formatMoney("IN", row.entry.current_value)}
              </td>
              <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${row.gainAbs >= 0 ? "text-pos" : "text-neg"}`}>
                {formatMoney("IN", row.gainAbs)} <span className="text-xs">({formatPct(row.gainPct)})</span>
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-xs text-muted">{row.entry.notes ?? "—"}</td>
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
                <td colSpan={7} className="px-3 py-2.5">
                  <EditEntryForm row={row} onDone={() => setEditingId(null)} />
                </td>
              </tr>
            ) : null,
          ])}
        </tbody>
      </table>
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

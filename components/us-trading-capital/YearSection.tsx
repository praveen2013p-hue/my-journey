"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NegativeAmountNoteButton } from "@/components/NegativeAmountNoteButton";
import { formatMoney, formatPct } from "@/lib/format-money";
import { monthLabel } from "@/lib/us-trading-capital-stats";
import type { UsTradingCapitalEntryView, UsTradingCapitalYearGroup } from "@/lib/us-trading-capital-stats";

function EditEntryForm({ row, onDone }: { row: UsTradingCapitalEntryView; onDone: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountText, setAmountText] = useState(String(row.entry.amount_added));
  const [negativeAmountNote, setNegativeAmountNote] = useState(row.entry.negative_amount_note ?? "");

  const amountNum = amountText.trim() === "" ? 0 : Number(amountText);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const withdrawalRaw = String(data.get("withdrawal") ?? "").trim();
    const inrRaw = String(data.get("inr_amount") ?? "").trim();
    const fxRaw = String(data.get("fx_rate") ?? "").trim();
    const valueFxRaw = String(data.get("value_fx_rate") ?? "").trim();
    const currentValue = Number(data.get("current_value"));
    const notes = String(data.get("notes") ?? "").trim();

    if (
      !Number.isFinite(amountNum) ||
      !Number.isFinite(currentValue) ||
      currentValue < 0 ||
      (withdrawalRaw !== "" && (!Number.isFinite(Number(withdrawalRaw)) || Number(withdrawalRaw) < 0)) ||
      (inrRaw !== "" && !Number.isFinite(Number(inrRaw))) ||
      (fxRaw !== "" && (!Number.isFinite(Number(fxRaw)) || Number(fxRaw) <= 0)) ||
      (valueFxRaw !== "" && (!Number.isFinite(Number(valueFxRaw)) || Number(valueFxRaw) <= 0))
    ) {
      setError("Enter valid numbers.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/us-trading-capital/${row.entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_added: amountNum,
          withdrawal: withdrawalRaw === "" ? 0 : Number(withdrawalRaw),
          inr_amount: inrRaw === "" ? null : Number(inrRaw),
          fx_rate: fxRaw === "" ? null : Number(fxRaw),
          value_fx_rate: valueFxRaw === "" ? null : Number(valueFxRaw),
          current_value: currentValue,
          notes: notes || null,
          negative_amount_note: amountNum < 0 ? negativeAmountNote.trim() || null : null,
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
      <label className="text-[10px] text-muted">
        INR amount
        <input
          type="number"
          step="any"
          name="inr_amount"
          defaultValue={row.entry.inr_amount ?? ""}
          className="mt-0.5 block min-h-[36px] w-24 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
        />
      </label>
      <label className="text-[10px] text-muted">
        Deposit rate
        <input
          type="number"
          step="any"
          name="fx_rate"
          defaultValue={row.entry.fx_rate ?? ""}
          className="mt-0.5 block min-h-[36px] w-20 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
        />
      </label>
      <label className="text-[10px] text-muted">
        Deposited (USD)
        <input
          type="number"
          step="any"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          className="mt-0.5 block min-h-[36px] w-24 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
        />
      </label>
      {amountNum < 0 && (
        <span className="pb-2">
          <NegativeAmountNoteButton
            initialValue={negativeAmountNote}
            hasNote={!!negativeAmountNote}
            onSave={setNegativeAmountNote}
          />
        </span>
      )}
      <input
        type="number"
        step="any"
        min="0"
        name="withdrawal"
        defaultValue={row.entry.withdrawal}
        aria-label="Withdrawal"
        placeholder="Withdrawn"
        className="min-h-[36px] w-28 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
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
      <label className="text-[10px] text-muted">
        Today&apos;s rate
        <input
          type="number"
          step="any"
          name="value_fx_rate"
          defaultValue={row.entry.value_fx_rate ?? ""}
          aria-label="Today's USD/INR rate"
          className="mt-0.5 block min-h-[36px] w-20 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
        />
      </label>
      <input
        type="text"
        name="notes"
        defaultValue={row.entry.notes ?? ""}
        aria-label="Notes"
        placeholder="Notes (optional)"
        className="min-h-[36px] w-36 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
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

export function YearRows({ rows }: { rows: UsTradingCapitalEntryView[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this month's entry? This can't be undone.")) return;
    await fetch(`/api/us-trading-capital/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Month</th>
            <th
              className="whitespace-nowrap px-3 py-2.5 text-right font-semibold"
              title="This month's deposit in USD - hover a converted month's figure to see the INR amount and rate used"
            >
              Deposited
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold" title="Total USD invested so far">
              Invested
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold" title="This month's actual account value, as you entered it">
              Value
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Withdrawn</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold" title="How much the Gain moved compared to the previous calendar month">
              Change
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Gain</th>
            <th
              className="whitespace-nowrap px-3 py-2.5 text-right font-semibold"
              title="Annualized return (USD only) as of this month"
            >
              Return (USD)
            </th>
            <th
              className="whitespace-nowrap px-3 py-2.5 text-right font-semibold"
              title="FX-adjusted annualized return (INR) as of this month - hover for today's rate used"
            >
              Real Return (₹)
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Notes</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((row) => [
            <tr key={row.entry.id} className="border-b border-border/60">
              <td className="whitespace-nowrap px-3 py-2.5 font-medium">{monthLabel(row.entry.month)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                <span
                  className={`${row.entry.amount_added < 0 ? "text-neg" : ""} ${
                    row.entry.inr_amount !== null || row.entry.fx_rate !== null
                      ? "cursor-help underline decoration-dotted decoration-muted underline-offset-4"
                      : ""
                  }`}
                  title={
                    row.entry.inr_amount !== null || row.entry.fx_rate !== null
                      ? `${row.entry.inr_amount !== null ? formatMoney("IN", row.entry.inr_amount) : "—"} @ ${row.entry.fx_rate ?? "—"}`
                      : undefined
                  }
                >
                  {formatMoney("US", row.entry.amount_added)}
                </span>
                {row.entry.amount_added < 0 && (
                  <NegativeAmountNoteButton
                    initialValue={row.entry.negative_amount_note ?? ""}
                    hasNote={!!row.entry.negative_amount_note}
                    onSave={async (text) => {
                      await fetch(`/api/us-trading-capital/${row.entry.id}`, {
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
                {formatMoney("US", row.cumulativeInvested)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {formatMoney("US", row.entry.current_value)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {row.entry.withdrawal > 0 ? formatMoney("US", row.entry.withdrawal) : <span className="text-muted">—</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {row.pnlChangeAbs === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className={row.pnlChangeAbs >= 0 ? "text-pos" : "text-neg"}>
                    {row.pnlChangeAbs >= 0 ? "▲ " : "▼ "}
                    {formatMoney("US", row.pnlChangeAbs)}
                  </span>
                )}
              </td>
              <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${row.gainAbs >= 0 ? "text-pos" : "text-neg"}`}>
                {formatMoney("US", row.gainAbs)} <span className="text-xs">({formatPct(row.gainPct)})</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {row.xirrPct === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className={row.xirrPct >= 0 ? "text-pos" : "text-neg"}>{formatPct(row.xirrPct)}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {row.realReturnPct === null ? (
                  <span className="text-muted" title={row.entry.value_fx_rate !== null ? undefined : "No today's-rate recorded for this month"}>
                    —
                  </span>
                ) : (
                  <span
                    className={row.realReturnPct >= 0 ? "text-pos" : "text-neg"}
                    title={row.entry.value_fx_rate !== null ? `@ ${row.entry.value_fx_rate}` : undefined}
                  >
                    {formatPct(row.realReturnPct)}
                  </span>
                )}
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
                <td colSpan={11} className="px-3 py-2.5">
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
export function YearSection({ group, defaultOpen }: { group: UsTradingCapitalYearGroup; defaultOpen: boolean }) {
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
            Deposited <span className="font-semibold text-text">{formatMoney("US", group.yearInvested)}</span>
          </span>
          <span className="text-muted">
            Year-end value <span className="font-semibold text-text">{formatMoney("US", group.yearEndValue)}</span>
          </span>
        </div>
      </summary>
      <div className="border-t border-border p-3">
        <YearRows rows={group.rows} />
      </div>
    </details>
  );
}

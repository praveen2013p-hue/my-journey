"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { NegativeAmountNoteButton } from "./NegativeAmountNoteButton";

function defaultMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Adds (or, for a month that already has one, replaces) one month's mutual fund entry. */
export function AddEntryModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountAddedText, setAmountAddedText] = useState("");
  const [negativeAmountNote, setNegativeAmountNote] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const month = String(data.get("month") ?? "");
    const amountAdded = String(data.get("amount_added") ?? "").trim();
    const withdrawal = String(data.get("withdrawal") ?? "").trim();
    const plannedAmount = String(data.get("planned_amount") ?? "").trim();
    const currentValue = Number(data.get("current_value"));
    const notes = String(data.get("notes") ?? "").trim();

    if (!month || !Number.isFinite(currentValue) || currentValue < 0) {
      setError("Pick a month and enter the current portfolio value.");
      return;
    }
    if (amountAdded !== "" && !Number.isFinite(Number(amountAdded))) {
      setError("Amount added must be a number.");
      return;
    }
    if (withdrawal !== "" && !Number.isFinite(Number(withdrawal))) {
      setError("Withdrawal must be a number.");
      return;
    }
    if (plannedAmount !== "" && !Number.isFinite(Number(plannedAmount))) {
      setError("Planned amount must be a number.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/mutual-funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          amount_added: amountAdded === "" ? 0 : Number(amountAdded),
          withdrawal: withdrawal === "" ? 0 : Number(withdrawal),
          planned_amount: plannedAmount === "" ? null : Number(plannedAmount),
          current_value: currentValue,
          notes: notes || null,
          negative_amount_note: Number(amountAdded) < 0 ? negativeAmountNote.trim() || null : null,
        }),
      });
      if (!res.ok) throw new Error("Couldn't save that month's entry.");

      setOpen(false);
      formRef.current?.reset();
      setAmountAddedText("");
      setNegativeAmountNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] items-center gap-2 rounded-lg border border-gold bg-gold px-3.5 font-semibold text-bg hover:bg-gold-hover"
      >
        + Add entry
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Add mutual fund entry">
          <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add entry</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-muted hover:bg-panel-alt hover:text-text"
              >
                ✕
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label htmlFor="mf_month" className="mb-1 block text-xs text-muted">
                  Month
                </label>
                <input
                  id="mf_month"
                  name="month"
                  type="month"
                  required
                  defaultValue={defaultMonthValue()}
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
                <p className="mt-1 text-xs text-muted">Re-entering a month you&apos;ve already added replaces it.</p>
              </div>

              <div>
                <label htmlFor="mf_amount_added" className="mb-1 block text-xs text-muted">
                  Amount added this month <span className="text-muted">(0 if none)</span>
                </label>
                <span className="flex items-center gap-1">
                  <input
                    id="mf_amount_added"
                    name="amount_added"
                    type="number"
                    step="any"
                    placeholder="0"
                    value={amountAddedText}
                    onChange={(e) => setAmountAddedText(e.target.value)}
                    className={`min-h-[44px] w-full rounded-lg border bg-field px-3 py-2 ${
                      Number(amountAddedText) < 0 ? "border-neg-border text-neg" : "border-border-strong text-text"
                    }`}
                  />
                  {amountAddedText !== "" && Number(amountAddedText) < 0 && (
                    <NegativeAmountNoteButton
                      initialValue={negativeAmountNote}
                      hasNote={!!negativeAmountNote}
                      onSave={setNegativeAmountNote}
                    />
                  )}
                </span>
              </div>

              <div>
                <label htmlFor="mf_planned_amount" className="mb-1 block text-xs text-muted">
                  Planned <span className="text-muted">(required as per your plan - optional)</span>
                </label>
                <input
                  id="mf_planned_amount"
                  name="planned_amount"
                  type="number"
                  step="any"
                  min="0"
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
              </div>

              <div>
                <label htmlFor="mf_withdrawal" className="mb-1 block text-xs text-muted">
                  Withdrawn this month <span className="text-muted">(0 if none)</span>
                </label>
                <input
                  id="mf_withdrawal"
                  name="withdrawal"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
              </div>

              <div>
                <label htmlFor="mf_current_value" className="mb-1 block text-xs text-muted">
                  Current portfolio value
                </label>
                <input
                  id="mf_current_value"
                  name="current_value"
                  type="number"
                  step="any"
                  min="0"
                  required
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
              </div>

              <div>
                <label htmlFor="mf_notes" className="mb-1 block text-xs text-muted">
                  Notes <span className="text-muted">(optional)</span>
                </label>
                <input
                  id="mf_notes"
                  name="notes"
                  type="text"
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
              </div>

              {error && <p className="text-sm text-neg">{error}</p>}

              <div className="mt-1 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-[44px] rounded-lg border border-border-strong bg-panel-alt px-3.5 text-text hover:bg-panel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg border border-gold bg-gold px-3.5 font-semibold text-bg hover:bg-gold-hover disabled:opacity-60"
                >
                  {submitting ? "Saving…" : "Save entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

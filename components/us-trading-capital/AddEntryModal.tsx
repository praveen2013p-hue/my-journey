"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { NegativeAmountNoteButton } from "@/components/NegativeAmountNoteButton";
import { formatMoney } from "@/lib/format-money";
import { convertInrToUsd } from "@/lib/us-trading-capital-stats";

function defaultMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Adds (or, for a month that already has one, replaces) one month's US Trading Capital entry. */
export function AddEntryModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inrText, setInrText] = useState("");
  const [fxText, setFxText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [amountManuallyEdited, setAmountManuallyEdited] = useState(false);
  const [negativeAmountNote, setNegativeAmountNote] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const amountAddedNum = amountText.trim() === "" ? 0 : Number(amountText);

  /** inr_amount/fx_rate live auto-fill the USD amount, unless the user has typed into that field directly - always overridable, since deposits don't always convert at a clean rate. */
  function recomputeAmount(nextInrText: string, nextFxText: string) {
    if (amountManuallyEdited) return;
    const inr = Number(nextInrText);
    const fx = Number(nextFxText);
    const usd = nextInrText.trim() !== "" && nextFxText.trim() !== "" ? convertInrToUsd(inr, fx) : null;
    setAmountText(usd !== null ? String(usd) : "");
  }

  function resetForm() {
    setInrText("");
    setFxText("");
    setAmountText("");
    setAmountManuallyEdited(false);
    setNegativeAmountNote("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const month = String(data.get("month") ?? "");
    const withdrawal = String(data.get("withdrawal") ?? "").trim();
    const valueFxRate = String(data.get("value_fx_rate") ?? "").trim();
    const currentValue = Number(data.get("current_value"));
    const notes = String(data.get("notes") ?? "").trim();

    if (!month || !Number.isFinite(currentValue) || currentValue < 0) {
      setError("Pick a month and enter the current account value.");
      return;
    }
    if (amountText.trim() !== "" && !Number.isFinite(amountAddedNum)) {
      setError("Deposited this month (USD) must be a number.");
      return;
    }
    if (withdrawal !== "" && !Number.isFinite(Number(withdrawal))) {
      setError("Withdrawal must be a number.");
      return;
    }
    if (inrText.trim() !== "" && !Number.isFinite(Number(inrText))) {
      setError("INR amount must be a number.");
      return;
    }
    if (fxText.trim() !== "" && (!Number.isFinite(Number(fxText)) || Number(fxText) <= 0)) {
      setError("Conversion rate must be a positive number.");
      return;
    }
    if (valueFxRate !== "" && (!Number.isFinite(Number(valueFxRate)) || Number(valueFxRate) <= 0)) {
      setError("Today's USD/INR rate must be a positive number.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/us-trading-capital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          amount_added: amountAddedNum,
          withdrawal: withdrawal === "" ? 0 : Number(withdrawal),
          inr_amount: inrText.trim() === "" ? null : Number(inrText),
          fx_rate: fxText.trim() === "" ? null : Number(fxText),
          value_fx_rate: valueFxRate === "" ? null : Number(valueFxRate),
          current_value: currentValue,
          notes: notes || null,
          negative_amount_note: amountAddedNum < 0 ? negativeAmountNote.trim() || null : null,
        }),
      });
      if (!res.ok) throw new Error("Couldn't save that month's entry.");

      setOpen(false);
      formRef.current?.reset();
      resetForm();
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Add US Trading Capital entry">
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
                <label htmlFor="utc_month" className="mb-1 block text-xs text-muted">
                  Month
                </label>
                <input
                  id="utc_month"
                  name="month"
                  type="month"
                  required
                  defaultValue={defaultMonthValue()}
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
                <p className="mt-1 text-xs text-muted">Re-entering a month you&apos;ve already added replaces it.</p>
              </div>

              <div className="rounded-lg border border-border-strong bg-panel-alt p-2.5">
                <div className="mb-1.5 text-xs text-muted">This month&apos;s deposit (0 if none)</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted">
                    INR amount
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 100000"
                      value={inrText}
                      onChange={(e) => {
                        setInrText(e.target.value);
                        recomputeAmount(e.target.value, fxText);
                      }}
                      className="mt-0.5 min-h-[40px] w-full rounded-lg border border-border-strong bg-field px-2.5 py-1.5 text-sm text-text"
                    />
                  </label>
                  <label className="text-xs text-muted">
                    Conversion rate for this deposit
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 83.3"
                      value={fxText}
                      onChange={(e) => {
                        setFxText(e.target.value);
                        recomputeAmount(inrText, e.target.value);
                      }}
                      className="mt-0.5 min-h-[40px] w-full rounded-lg border border-border-strong bg-field px-2.5 py-1.5 text-sm text-text"
                    />
                  </label>
                </div>
                <label className="mt-2 block text-xs text-muted">
                  Deposited this month (USD) <span className="text-muted">- auto-filled above, editable</span>
                  <input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={amountText}
                    onChange={(e) => {
                      setAmountManuallyEdited(true);
                      setAmountText(e.target.value);
                    }}
                    className="mt-0.5 min-h-[40px] w-full rounded-lg border border-border-strong bg-field px-2.5 py-1.5 text-sm font-semibold text-text"
                  />
                </label>
                {amountAddedNum < 0 && (
                  <div className="mt-1.5 flex items-center gap-1 text-xs text-neg">
                    Deposit is negative
                    <NegativeAmountNoteButton
                      initialValue={negativeAmountNote}
                      hasNote={!!negativeAmountNote}
                      onSave={setNegativeAmountNote}
                    />
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="utc_withdrawal" className="mb-1 block text-xs text-muted">
                  Withdrawn this month (USD) <span className="text-muted">(0 if none)</span>
                </label>
                <input
                  id="utc_withdrawal"
                  name="withdrawal"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
              </div>

              <div>
                <label htmlFor="utc_current_value" className="mb-1 block text-xs text-muted">
                  Current account value (USD)
                </label>
                <input
                  id="utc_current_value"
                  name="current_value"
                  type="number"
                  step="any"
                  min="0"
                  required
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
              </div>

              <div>
                <label htmlFor="utc_value_fx_rate" className="mb-1 block text-xs text-muted">
                  Today&apos;s USD/INR rate <span className="text-muted">(optional - for your Real Return)</span>
                </label>
                <input
                  id="utc_value_fx_rate"
                  name="value_fx_rate"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 83.3"
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
              </div>

              <div>
                <label htmlFor="utc_notes" className="mb-1 block text-xs text-muted">
                  Notes <span className="text-muted">(optional)</span>
                </label>
                <input
                  id="utc_notes"
                  name="notes"
                  type="text"
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
              </div>

              {inrText.trim() !== "" && fxText.trim() !== "" && (
                <p className="text-xs text-muted">
                  {formatMoney("IN", Number(inrText) || 0)} @ {fxText} → {formatMoney("US", amountAddedNum)}
                </p>
              )}

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

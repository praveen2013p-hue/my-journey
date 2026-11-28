"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Market } from "@/lib/db/schema-types";

const CONFIRM_WORD = "RESET";

/**
 * "Reset all data" (Issue 14) - deletes every trade in the CURRENTLY
 * SELECTED market only (never both at once, see lib/db/trades.ts's
 * deleteAllTrades). Stronger than the per-trade `confirm()` dialog
 * already used elsewhere: this can wipe many trades at once and can't be
 * undone, so it requires typing a confirm word, not just one click.
 */
export function ResetAllButton({ market, tradeCount }: { market: Market; tradeCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marketLabel = "US $";

  async function handleReset() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades?market=${market}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't reset.");
      setOpen(false);
      setConfirmText("");
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
        disabled={tradeCount === 0}
        className="flex min-h-[44px] items-center gap-2 rounded-lg border border-neg-border bg-panel-alt px-3.5 text-sm font-medium text-neg hover:bg-neg-wash disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reset all data
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Reset all Journal data"
        >
          <div className="w-full max-w-md rounded-xl border border-neg-border bg-panel p-6">
            <h2 className="mb-2 text-lg font-semibold text-neg">Reset all {marketLabel} trades?</h2>
            <p className="mb-4 text-sm text-muted">
              This permanently deletes all <b className="text-text">{tradeCount}</b> {marketLabel} trade
              {tradeCount === 1 ? "" : "s"} in your Journal — open and closed.{" "}
              <b className="text-neg">This cannot be undone.</b>
            </p>
            <label htmlFor="reset-confirm" className="mb-1 block text-xs text-muted">
              Type <b className="text-text">{CONFIRM_WORD}</b> to confirm
            </label>
            <input
              id="reset-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              className="mb-4 min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
            />
            {error && <p className="mb-3 text-sm text-neg">{error}</p>}
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setConfirmText("");
                  setError(null);
                }}
                className="min-h-[44px] rounded-lg border border-border-strong bg-panel-alt px-3.5 text-text hover:bg-panel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={confirmText !== CONFIRM_WORD || submitting}
                className="min-h-[44px] rounded-lg border border-neg-border bg-neg px-3.5 font-semibold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Resetting…" : `Delete all ${tradeCount} trades`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

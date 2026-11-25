"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PlusIcon } from "@/components/icons";
import type { Market } from "@/lib/db/schema-types";

/**
 * Per-row "Add to ▾" action for Breakouts/Pullbacks (BRIEF.md-adjacent
 * feature request): a small extensible menu, Journal today, a Watchlist
 * placeholder for later. Journal add is a quick form prefilled from the
 * alert (ticker/market/trigger price/alert_id) so logging a trade from
 * the table doesn't need the full Add Trade modal.
 */
export function AddToButton({
  market,
  ticker,
  alertId,
  defaultPrice,
  triggerClassName,
  triggerLabel,
}: {
  market: Market;
  ticker: string;
  /** Null for a row with no specific alert behind it (e.g. a sector constituent that never triggered one). */
  alertId: string | null;
  defaultPrice: number | null;
  /** Override the trigger button's styling (default: a small table-row pill). */
  triggerClassName?: string;
  /** Override the trigger button's label when not showing the "Added ✓" state. */
  triggerLabel?: string;
}) {
  const router = useRouter();
  const formIdSuffix = alertId ?? ticker;
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const buyDate = String(data.get("buy_date") ?? "");
    const quantity = Number(data.get("quantity"));
    const buyPrice = Number(data.get("buy_price"));

    if (!buyDate || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(buyPrice) || buyPrice <= 0) {
      setError("Fill in buy date, quantity and buy price.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market,
          ticker,
          buy_date: buyDate,
          quantity,
          buy_price: buyPrice,
          sell_date: null,
          sell_price: null,
          strategy_tag_id: null,
          alert_id: alertId,
        }),
      });
      if (!res.ok) throw new Error("Couldn't add to Journal.");
      setModalOpen(false);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className={
          triggerClassName ??
          "flex min-h-[32px] items-center gap-1 rounded-md border border-border-strong bg-panel-alt px-2 text-xs font-medium hover:bg-panel"
        }
      >
        {saved ? "Added ✓" : triggerLabel ?? "Add to ▾"}
      </button>

      {menuOpen && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border-strong bg-panel p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setModalOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-panel-alt"
          >
            <PlusIcon /> Journal
          </button>
          <button
            type="button"
            disabled
            title="Coming later"
            className="flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-muted opacity-60"
          >
            <PlusIcon /> Watchlist (soon)
          </button>
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add to Journal"
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Add {ticker} to Journal · {market === "IN" ? "India ₹" : "US $"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-muted hover:bg-panel-alt hover:text-text"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`buy_date_${formIdSuffix}`} className="mb-1 block text-xs text-muted">
                    Buy date
                  </label>
                  <input
                    id={`buy_date_${formIdSuffix}`}
                    name="buy_date"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="min-h-[40px] w-full rounded-lg border border-border-strong bg-field px-3 text-text"
                  />
                </div>
                <div>
                  <label htmlFor={`qty_${formIdSuffix}`} className="mb-1 block text-xs text-muted">
                    Quantity
                  </label>
                  <input
                    id={`qty_${formIdSuffix}`}
                    name="quantity"
                    type="number"
                    step="any"
                    min="0"
                    required
                    autoFocus
                    className="min-h-[40px] w-full rounded-lg border border-border-strong bg-field px-3 text-text"
                  />
                </div>
              </div>
              <div>
                <label htmlFor={`price_${formIdSuffix}`} className="mb-1 block text-xs text-muted">
                  Buy price
                </label>
                <input
                  id={`price_${formIdSuffix}`}
                  name="buy_price"
                  type="number"
                  step="any"
                  min="0"
                  required
                  defaultValue={defaultPrice ?? undefined}
                  className="min-h-[40px] w-full rounded-lg border border-border-strong bg-field px-3 text-text"
                />
              </div>
              {error && <p className="text-sm text-neg">{error}</p>}
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[40px] rounded-lg border border-border-strong bg-panel-alt px-3.5 text-text hover:bg-panel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] rounded-lg border border-gold bg-gold px-3.5 font-semibold text-bg hover:bg-gold-hover disabled:opacity-60"
                >
                  {submitting ? "Saving…" : "Save trade"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

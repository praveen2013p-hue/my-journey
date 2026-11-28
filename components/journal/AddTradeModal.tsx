"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Market } from "@/lib/db/schema-types";
import type { TickerOption } from "@/lib/journal-data";

export function AddTradeModal({
  market,
  tickerOptions,
  strategyTagNames,
}: {
  market: Market;
  tickerOptions: TickerOption[];
  strategyTagNames: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const optionsForMarket = tickerOptions.filter((o) => o.market === market);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const ticker = String(data.get("ticker") ?? "").trim().toUpperCase();
    const buyDate = String(data.get("buy_date") ?? "");
    const quantity = Number(data.get("quantity"));
    const buyPrice = Number(data.get("buy_price"));
    const sellDate = String(data.get("sell_date") ?? "").trim();
    const sellPrice = String(data.get("sell_price") ?? "").trim();
    const strategyName = String(data.get("strategy_tag") ?? "").trim();
    const stopLossRaw = String(data.get("stop_loss") ?? "").trim();
    const stopLoss = stopLossRaw === "" ? null : Number(stopLossRaw);

    if (!ticker || !buyDate || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(buyPrice)) {
      setError("Fill in stock, buy date, quantity and buy price.");
      return;
    }
    if (Boolean(sellDate) !== Boolean(sellPrice)) {
      setError("Set both sell date and sell price, or leave both blank for an open trade.");
      return;
    }
    if (stopLoss !== null && !Number.isFinite(stopLoss)) {
      setError("Stop loss must be a number.");
      return;
    }

    setSubmitting(true);
    try {
      let strategyTagId: string | null = null;
      if (strategyName) {
        const tagRes = await fetch("/api/strategy-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: strategyName }),
        });
        if (!tagRes.ok) throw new Error("Couldn't save the strategy tag.");
        const tagData = await tagRes.json();
        strategyTagId = tagData.tag.id;
      }

      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market,
          ticker,
          buy_date: buyDate,
          quantity,
          buy_price: buyPrice,
          sell_date: sellDate || null,
          sell_price: sellPrice || null,
          strategy_tag_id: strategyTagId,
          stop_loss: stopLoss,
        }),
      });
      if (!res.ok) throw new Error("Couldn't save the trade.");

      setOpen(false);
      formRef.current?.reset();
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
        + Add trade
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Add trade">
          <div className="w-full max-w-lg rounded-xl border border-border bg-panel p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add trade · US $</h2>
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
                <label htmlFor="ticker" className="mb-1 block text-xs text-muted">
                  Stock
                </label>
                <input
                  id="ticker"
                  name="ticker"
                  list="journal-ticker-options"
                  required
                  autoComplete="off"
                  placeholder="e.g. SBIN"
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
                <datalist id="journal-ticker-options">
                  {optionsForMarket.map((o) => (
                    <option key={o.ticker} value={o.ticker} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="buy_date" className="mb-1 block text-xs text-muted">
                    Buy date
                  </label>
                  <input
                    id="buy_date"
                    name="buy_date"
                    type="date"
                    required
                    className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                  />
                </div>
                <div>
                  <label htmlFor="quantity" className="mb-1 block text-xs text-muted">
                    Quantity
                  </label>
                  <input
                    id="quantity"
                    name="quantity"
                    type="number"
                    step="any"
                    min="0"
                    required
                    className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="buy_price" className="mb-1 block text-xs text-muted">
                  Buy price
                </label>
                <input
                  id="buy_price"
                  name="buy_price"
                  type="number"
                  step="any"
                  min="0"
                  required
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
              </div>

              <div>
                <label htmlFor="stop_loss" className="mb-1 block text-xs text-muted">
                  Stop loss <span className="text-muted">(optional - for R-multiple)</span>
                </label>
                <input
                  id="stop_loss"
                  name="stop_loss"
                  type="number"
                  step="any"
                  min="0"
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <div>
                  <label htmlFor="sell_date" className="mb-1 block text-xs text-muted">
                    Sell date (optional)
                  </label>
                  <input
                    id="sell_date"
                    name="sell_date"
                    type="date"
                    className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                  />
                </div>
                <div>
                  <label htmlFor="sell_price" className="mb-1 block text-xs text-muted">
                    Sell price (optional)
                  </label>
                  <input
                    id="sell_price"
                    name="sell_price"
                    type="number"
                    step="any"
                    min="0"
                    className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="strategy_tag" className="mb-1 block text-xs text-muted">
                  Strategy tag (pick or type to create)
                </label>
                <input
                  id="strategy_tag"
                  name="strategy_tag"
                  list="journal-strategy-tags"
                  autoComplete="off"
                  className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
                />
                <datalist id="journal-strategy-tags">
                  {strategyTagNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              {error && <p className="text-sm text-neg">{error}</p>}

              <div className="mt-2 flex justify-end gap-2.5">
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
                  {submitting ? "Saving…" : "Save trade"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

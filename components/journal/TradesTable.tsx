"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Chip } from "@/components/Chip";
import { TradingViewLink } from "@/components/TradingViewLink";
import { formatMoney, formatPct } from "@/lib/format-money";
import type { ClosedTradeRowView, TradeRowView } from "@/lib/journal-data";
import { daysBetween } from "@/lib/trade-stats";
import { quoteKey, useQuotes } from "@/lib/use-quotes";

function fmtQty(value: number): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

function CloseTradeForm({ tradeId, onDone }: { tradeId: string; onDone: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const sellDate = String(data.get("sell_date") ?? "");
    const sellPrice = String(data.get("sell_price") ?? "");
    if (!sellDate || !sellPrice) {
      setError("Enter both sell date and sell price.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades/${tradeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sell_date: sellDate, sell_price: Number(sellPrice) }),
      });
      if (!res.ok) throw new Error("Couldn't close the trade.");
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-strong bg-panel-alt p-2.5">
      <input
        type="date"
        name="sell_date"
        required
        aria-label="Sell date"
        className="min-h-[36px] rounded-md border border-border-strong bg-field px-2 text-sm text-text"
      />
      <input
        type="number"
        step="any"
        min="0"
        name="sell_price"
        required
        aria-label="Sell price"
        placeholder="Sell price"
        className="min-h-[36px] w-28 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
      />
      <button
        type="submit"
        disabled={submitting}
        className="min-h-[36px] rounded-md border border-gold bg-gold px-2.5 text-sm font-semibold text-bg hover:bg-gold-hover disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Confirm sell"}
      </button>
      <button type="button" onClick={onDone} className="text-xs text-muted hover:text-text">
        Cancel
      </button>
      {error && <span className="text-xs text-neg">{error}</span>}
    </form>
  );
}

export function OpenTradesTable({ rows, todayIso }: { rows: TradeRowView[]; todayIso: string }) {
  const router = useRouter();
  const [closingId, setClosingId] = useState<string | null>(null);
  const quotes = useQuotes(rows.map((r) => ({ market: r.trade.market, symbol: r.providerSymbol })));

  async function handleDelete(id: string) {
    if (!confirm("Delete this trade? This can't be undone.")) return;
    await fetch(`/api/trades/${id}`, { method: "DELETE" });
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">No open trades.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-panel">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Stock</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Strategy</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Buy date</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Qty</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Buy</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Live</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">P&amp;L</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">P&amp;L %</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Days</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const quote = row.providerSymbol
              ? quotes.get(quoteKey(row.trade.market, row.providerSymbol))
              : undefined;
            const livePrice = quote?.price ?? null;
            const pnlAbs = livePrice !== null ? (livePrice - row.trade.buy_price) * row.trade.quantity : null;
            const pnlPct = livePrice !== null ? ((livePrice - row.trade.buy_price) / row.trade.buy_price) * 100 : null;
            const holdingDays = daysBetween(row.trade.buy_date, todayIso);

            return [
              <tr key={row.trade.id} className="border-b border-border/60">
                <td className="whitespace-nowrap px-3 py-2.5">
                  {row.exchange ? (
                    <TradingViewLink exchange={row.exchange} ticker={row.trade.ticker} />
                  ) : (
                    <span className="font-semibold">{row.trade.ticker}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Chip variant="gold">{row.strategyTagName}</Chip>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{row.trade.buy_date}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{fmtQty(row.trade.quantity)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {formatMoney(row.trade.market, row.trade.buy_price)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {livePrice !== null ? formatMoney(row.trade.market, livePrice) : "—"}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2.5 text-right ${pnlAbs !== null && pnlAbs >= 0 ? "text-pos" : pnlAbs !== null ? "text-neg" : "text-muted"}`}
                >
                  {pnlAbs !== null ? formatMoney(row.trade.market, pnlAbs) : "—"}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2.5 text-right ${pnlPct !== null && pnlPct >= 0 ? "text-pos" : pnlPct !== null ? "text-neg" : "text-muted"}`}
                >
                  {formatPct(pnlPct)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{holdingDays}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setClosingId(closingId === row.trade.id ? null : row.trade.id)}
                      className="rounded-md border border-border-strong bg-panel-alt px-2 py-1 text-xs font-medium hover:bg-panel"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(row.trade.id)}
                      className="rounded-md border border-border-strong bg-panel-alt px-2 py-1 text-xs font-medium text-neg hover:bg-panel"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>,
              closingId === row.trade.id ? (
                <tr key={`${row.trade.id}-close-form`} className="border-b border-border/60">
                  <td colSpan={10} className="px-3 py-2.5">
                    <CloseTradeForm tradeId={row.trade.id} onDone={() => setClosingId(null)} />
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ClosedTradesTable({ rows }: { rows: ClosedTradeRowView[] }) {
  const router = useRouter();

  async function handleDelete(id: string) {
    if (!confirm("Delete this trade? This can't be undone.")) return;
    await fetch(`/api/trades/${id}`, { method: "DELETE" });
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">No closed trades yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-panel">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Stock</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Strategy</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Buy date</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Sell date</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Qty</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Buy</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Sell</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">P&amp;L</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">P&amp;L %</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">R</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Days</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.trade.id} className="border-b border-border/60">
              <td className="whitespace-nowrap px-3 py-2.5">
                {row.exchange ? (
                  <TradingViewLink exchange={row.exchange} ticker={row.trade.ticker} />
                ) : (
                  <span className="font-semibold">{row.trade.ticker}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <Chip variant="gold">{row.strategyTagName}</Chip>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">{row.trade.buy_date}</td>
              <td className="whitespace-nowrap px-3 py-2.5">{row.trade.sell_date}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">{fmtQty(row.trade.quantity)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                {formatMoney(row.trade.market, row.trade.buy_price)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                {formatMoney(row.trade.market, row.trade.sell_price as number)}
              </td>
              <td className={`whitespace-nowrap px-3 py-2.5 text-right ${row.pnlAbs >= 0 ? "text-pos" : "text-neg"}`}>
                {formatMoney(row.trade.market, row.pnlAbs)}
              </td>
              <td className={`whitespace-nowrap px-3 py-2.5 text-right ${row.pnlPct >= 0 ? "text-pos" : "text-neg"}`}>
                {formatPct(row.pnlPct)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                {row.rMultiple === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className={row.rMultiple >= 0 ? "text-pos" : "text-neg"}>
                    {row.rMultiple >= 0 ? "+" : ""}
                    {row.rMultiple.toFixed(2)}R
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">{row.holdingDays}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => handleDelete(row.trade.id)}
                  className="rounded-md border border-border-strong bg-panel-alt px-2 py-1 text-xs font-medium text-neg hover:bg-panel"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

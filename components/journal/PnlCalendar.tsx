"use client";

import { useMemo, useState } from "react";
import { Chip } from "@/components/Chip";
import { TradingViewLink } from "@/components/TradingViewLink";
import { formatMoney } from "@/lib/format-money";
import { buildCalendarMonth, shiftMonth, type CalendarTrade } from "@/lib/journal-calendar";
import type { Market } from "@/lib/db/schema-types";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Journal's P&L calendar (new feature, not a bug fix - the app had no
 * calendar before this). A day's P&L is the sum of realised P&L for
 * trades whose sell_date falls that day; open trades never appear here.
 * All month math lives in lib/journal-calendar.ts, which is
 * timezone-independent by construction - this component just renders it
 * and holds which month is currently in view.
 */
export function PnlCalendar({
  market,
  trades,
  defaultMonth,
}: {
  market: Market;
  trades: CalendarTrade[];
  defaultMonth: string; // "yyyy-MM", computed server-side in the market's own timezone
}) {
  const [monthKey, setMonthKey] = useState(defaultMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const calendar = useMemo(() => buildCalendarMonth(trades, monthKey), [trades, monthKey]);
  const selectedDay = selectedDate ? calendar.weeks.flat().find((d) => d.date === selectedDate) ?? null : null;

  function goToMonth(delta: number) {
    setMonthKey((current) => shiftMonth(current, delta));
    setSelectedDate(null);
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-4.5" aria-label="P&L calendar">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">P&amp;L calendar</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            aria-label="Previous month"
            className="flex min-h-[36px] items-center justify-center rounded-md border border-border-strong bg-panel-alt px-2.5 text-muted hover:bg-panel"
          >
            ‹
          </button>
          <span className="min-w-[140px] text-center font-semibold">{calendar.label}</span>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            aria-label="Next month"
            className="flex min-h-[36px] items-center justify-center rounded-md border border-border-strong bg-panel-alt px-2.5 text-muted hover:bg-panel"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span>
          Month total:{" "}
          <b className={calendar.monthTotalPnl >= 0 ? "text-pos" : "text-neg"}>
            {formatMoney(market, calendar.monthTotalPnl)}
          </b>
        </span>
        <span>
          {calendar.winDayCount} win day{calendar.winDayCount === 1 ? "" : "s"} · {calendar.lossDayCount} loss day
          {calendar.lossDayCount === 1 ? "" : "s"} · {calendar.tradingDayCount} trading day
          {calendar.tradingDayCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1 font-semibold">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {calendar.weeks.flat().map((day) => {
          const isSelected = day.date === selectedDate;
          const hasTrades = day.trades.length > 0;
          const colorClass =
            day.pnl === null
              ? "bg-panel-alt text-muted"
              : day.pnl > 0
                ? "bg-pos-wash text-pos"
                : day.pnl < 0
                  ? "bg-neg-wash text-neg"
                  : "bg-panel-alt text-muted";

          return (
            <button
              key={day.date}
              type="button"
              disabled={!hasTrades}
              onClick={() => setSelectedDate(isSelected ? null : day.date)}
              className={`flex min-h-[64px] flex-col items-start gap-0.5 rounded-lg border px-1.5 py-1 text-left text-xs transition-colors ${
                day.inMonth ? "" : "opacity-40"
              } ${hasTrades ? "cursor-pointer" : "cursor-default"} ${
                isSelected ? "border-gold" : "border-border-strong"
              } ${colorClass}`}
            >
              <span className="font-semibold">{Number(day.date.slice(-2))}</span>
              {day.pnl !== null && (
                <span className="tabular-nums">
                  {day.pnl >= 0 ? "+" : ""}
                  {formatMoney(market, day.pnl)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && selectedDay.trades.length > 0 && (
        <div className="mt-4 rounded-lg border border-border-strong bg-panel-alt p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {selectedDay.date} · {selectedDay.trades.length} trade{selectedDay.trades.length === 1 ? "" : "s"} closed
            </h3>
            <button type="button" onClick={() => setSelectedDate(null)} className="text-xs text-muted hover:text-text">
              Close
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {selectedDay.trades.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <TradingViewLink exchange={t.exchange ?? (market === "IN" ? "NSE" : "NASDAQ")} ticker={t.ticker} />
                <Chip variant={t.pnlAbs >= 0 ? "green" : "red"}>{formatMoney(market, t.pnlAbs)}</Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

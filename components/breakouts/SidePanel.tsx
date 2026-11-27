"use client";

import { useEffect, useRef, useState } from "react";
import { Chip, gradeVariant, stageVariant } from "@/components/Chip";
import { CloseIcon, ExternalLinkIcon } from "@/components/icons";
import { AddToButton } from "@/components/journal/AddToButton";
import { TradingViewLink, tradingViewUrl } from "@/components/TradingViewLink";
import type { BreakoutRow } from "@/lib/breakouts-data";
import type { SignalType } from "@/lib/db/schema-types";
import type { SectorContextDetail } from "@/lib/sector-context";
import { quoteKey, useQuotes } from "@/lib/use-quotes";
import { WeeklyChart, type WeeklyChartBar } from "./WeeklyChart";

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "▲ +" : "▼ ";
  return `${sign}${value.toFixed(1)}%`;
}

export function SidePanel({
  row,
  signalType,
  onClose,
}: {
  row: BreakoutRow;
  signalType: SignalType;
  onClose: () => void;
}) {
  const quotes = useQuotes([{ market: row.market, symbol: row.providerSymbol }]);
  const quote = row.providerSymbol ? quotes.get(quoteKey(row.market, row.providerSymbol)) : undefined;
  const livePrice = quote?.price ?? null;
  const pctSinceTrigger = livePrice !== null ? ((livePrice - row.triggerPrice) / row.triggerPrice) * 100 : null;

  const [bars, setBars] = useState<WeeklyChartBar[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    if (!row.providerSymbol) {
      return;
    }
    let cancelled = false;
    fetch(`/api/weekly-history?market=${row.market}&symbol=${encodeURIComponent(row.providerSymbol)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setBars(data.bars ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.market, row.providerSymbol]);

  const [sectorContexts, setSectorContexts] = useState<SectorContextDetail[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sectors/context?market=${row.market}&ticker=${encodeURIComponent(row.ticker)}&weekEnding=${row.weekEnding}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSectorContexts(data.contexts ?? []);
      })
      .catch(() => {
        if (!cancelled) setSectorContexts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [row.market, row.ticker, row.weekEnding]);

  const [note, setNote] = useState("");
  const [noteLoaded, setNoteLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notes?market=${row.market}&ticker=${encodeURIComponent(row.ticker)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setNote(data.note ?? "");
      })
      .finally(() => {
        if (!cancelled) setNoteLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [row.market, row.ticker]);

  function handleNoteChange(value: string) {
    setNote(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market: row.market, ticker: row.ticker, note: value }),
      }).catch(() => {});
    }, 700);
  }

  const belowMa = livePrice !== null && row.ma30w !== null && livePrice < row.ma30w;
  const extended =
    livePrice !== null && row.breakoutLevel !== null && livePrice > row.breakoutLevel * 1.2;

  return (
    <aside
      className="flex w-full flex-shrink-0 flex-col gap-5 overflow-y-auto border-l border-border bg-panel-alt p-6 md:w-[430px]"
      aria-label="Stock details"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <TradingViewLink exchange={row.exchange} ticker={row.ticker} className="text-2xl" />
          <div className="text-xs text-muted">
            {row.sector ?? "—"} · {row.exchange}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Chip variant="neutral">{row.market}</Chip>
            <Chip variant="gold">{signalType === "breakout" ? "Breakout" : "Pullback"}</Chip>
            <Chip variant={gradeVariant(row.grade)}>● {row.grade}</Chip>
            {row.qualityScore !== null && <Chip variant="green">Quality {row.qualityScore}</Chip>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md p-1.5 text-muted hover:bg-panel hover:text-text"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <AddToButton
          market={row.market}
          ticker={row.ticker}
          alertId={row.id}
          defaultPrice={livePrice ?? row.triggerPrice}
          triggerLabel="+ Log trade ▾"
          triggerClassName="flex min-h-[44px] items-center gap-2 rounded-lg border border-gold bg-gold px-3.5 font-semibold text-bg hover:bg-gold-hover"
        />
        <a
          href={tradingViewUrl(row.exchange, row.ticker)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border-strong bg-panel px-3.5 text-text hover:bg-panel-alt"
        >
          <ExternalLinkIcon /> Open in TradingView
        </a>
      </div>

      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Trigger vs live</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 tabular-nums">
          <div>
            <span className="block text-xs text-muted">Trigger price ({row.weekEnding})</span>
            <b className="text-[15px] font-semibold">{fmt(row.triggerPrice)}</b>
          </div>
          <div>
            <span className="block text-xs text-muted">Live price</span>
            <b className="text-[15px] font-semibold">
              {row.providerSymbol === null ? (
                <span className="text-xs font-normal text-muted">price unavailable</span>
              ) : livePrice === null ? (
                <span className="text-xs font-normal text-muted">loading…</span>
              ) : (
                <>
                  {fmt(livePrice)}{" "}
                  <span className={pctSinceTrigger !== null && pctSinceTrigger >= 0 ? "text-pos" : "text-neg"}>
                    {fmtPct(pctSinceTrigger)}
                  </span>
                </>
              )}
            </b>
          </div>
          <div>
            <span className="block text-xs text-muted">Breakout level</span>
            <b className="text-[15px] font-semibold">{fmt(row.breakoutLevel)}</b>
          </div>
          <div>
            <span className="block text-xs text-muted">Volume ratio</span>
            <b className="text-[15px] font-semibold">{row.volRatio !== null ? `${row.volRatio.toFixed(1)}×` : "—"}</b>
          </div>
          <div>
            <span className="block text-xs text-muted">Mansfield RS</span>
            <b className={`text-[15px] font-semibold ${row.mrs !== null && row.mrs > 0 ? "text-pos" : "text-neg"}`}>
              {row.mrs !== null ? (row.mrs > 0 ? "+" : "") + row.mrs.toFixed(1) : "—"}
            </b>
          </div>
          <div>
            <span className="block text-xs text-muted">Above 30W MA · overhead</span>
            <b className="text-[15px] font-semibold">
              {row.pctAboveMa !== null ? `${row.pctAboveMa.toFixed(1)}%` : "—"} ·{" "}
              {row.overheadPct !== null ? `${row.overheadPct.toFixed(0)}%` : "—"}
            </b>
          </div>
        </div>
        {(belowMa || extended) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {belowMa && <Chip variant="red">Below 30W MA</Chip>}
            {extended && <Chip variant="amber">Extended &gt;20%</Chip>}
          </div>
        )}
      </section>

      {signalType === "pullback" && row.originalBreakoutDate && (
        <section>
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Original breakout</h3>
          <div className="text-sm">
            {row.originalBreakoutDate} · Grade {row.originalGrade} · {row.weeksSinceBreakout} week
            {row.weeksSinceBreakout === 1 ? "" : "s"} ago
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
          Weekly chart · 30W MA · volume
        </h3>
        {row.providerSymbol === null ? (
          <p className="text-sm text-muted">No chart — this ticker&apos;s provider symbol isn&apos;t mapped yet.</p>
        ) : chartLoading ? (
          <p className="text-sm text-muted">Loading chart…</p>
        ) : bars.length === 0 ? (
          <p className="text-sm text-muted">No weekly history available.</p>
        ) : (
          <WeeklyChart bars={bars} breakoutLevel={row.breakoutLevel} />
        )}
      </section>

      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Sector context</h3>
        <div className="mb-2 text-sm text-muted">
          TradingView label: {row.sector ?? "—"} {row.industry ? `· ${row.industry}` : ""}
        </div>
        {sectorContexts === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : sectorContexts.length === 0 ? (
          <p className="text-sm text-muted">
            Not in any uploaded sector constituent list yet - upload one in Settings to see this stock&apos;s
            tracked sectors&apos; Stage and RS here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sectorContexts.map((ctx) => (
              <div key={ctx.sector} className="flex items-center justify-between gap-2.5 text-sm">
                <span className="flex items-center gap-1.5">
                  {ctx.isFocus && <span className="text-gold-light">★</span>} {ctx.sector}
                </span>
                <span className="flex items-center gap-2">
                  <Chip variant={stageVariant(ctx.stage)}>{ctx.stage ? `Stage ${ctx.stage}` : "—"}</Chip>
                  <span className={`tabular-nums ${ctx.mrs !== null && ctx.mrs > 0 ? "text-pos" : "text-muted"}`}>
                    {ctx.mrs !== null ? `RS ${ctx.mrs > 0 ? "+" : ""}${ctx.mrs.toFixed(1)}` : "RS —"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Fundamentals</h3>
        {row.fundamentals ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 tabular-nums">
            <FundamentalField label="Market cap" value={field(row.fundamentals, "marketCap")} />
            <FundamentalField label="P/E" value={field(row.fundamentals, "pe")} />
            <FundamentalField
              label="Sales growth YoY · QoQ"
              value={`${field(row.fundamentals, "salesGrowthYoY")} · ${field(row.fundamentals, "salesGrowthQoQ")}`}
            />
            <FundamentalField
              label="EPS growth YoY · QoQ"
              value={`${field(row.fundamentals, "epsGrowthYoY")} · ${field(row.fundamentals, "epsGrowthQoQ")}`}
            />
            <FundamentalField label="ROE · ROCE" value={`${field(row.fundamentals, "roe")} · ${field(row.fundamentals, "roce")}`} />
            <FundamentalField label="Debt / equity" value={field(row.fundamentals, "debtToEquity")} />
          </div>
        ) : (
          <p className="text-sm text-muted">Not sent with this alert.</p>
        )}
      </section>

      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">My notes</h3>
        <textarea
          aria-label="My notes about this stock"
          value={note}
          disabled={!noteLoaded}
          onChange={(e) => handleNoteChange(e.target.value)}
          className="min-h-[76px] w-full resize-none rounded-lg border border-border-strong bg-field px-3 py-2.5 text-text"
        />
      </section>
    </aside>
  );
}

function field(fundamentals: Record<string, unknown>, key: string): string {
  const value = fundamentals[key];
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toString();
  return String(value);
}

function FundamentalField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-muted">{label}</span>
      <b className="text-[15px] font-semibold">{value}</b>
    </div>
  );
}

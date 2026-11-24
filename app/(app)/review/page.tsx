import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { Chip } from "@/components/Chip";
import { TradingViewLink } from "@/components/TradingViewLink";
import { ReflectionBox } from "@/components/weekly-review/ReflectionBox";
import { DataFreshnessStrip } from "@/components/DataFreshnessStrip";
import { PageHeader } from "@/components/PageHeader";
import { verifySession } from "@/lib/auth/dal";
import { formatMoney, formatPct } from "@/lib/format-money";
import { getFreshnessData } from "@/lib/freshness-data";
import { getWeeklyReviewData } from "@/lib/weekly-review-data";

export default async function WeeklyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await verifySession();
  const { week } = await searchParams;
  const [freshness, data] = await Promise.all([getFreshnessData(), getWeeklyReviewData(session.userId, week)]);

  return (
    <>
      <DataFreshnessStrip {...freshness} />
      <PageHeader
        title="Weekly Review"
        subtitle={data.weekEnding ? `Week ${data.weekStart} – ${data.weekEnding}` : "No alerts yet"}
        actions={
          <>
            <Link
              href={`/review?week=${data.prevWeek}`}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border-strong bg-panel-alt px-3.5 text-text hover:bg-panel"
            >
              <ChevronLeftIcon /> Prev week
            </Link>
            <Link
              href={`/review?week=${data.nextWeek}`}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border-strong bg-panel-alt px-3.5 text-text hover:bg-panel"
            >
              Next week <ChevronRightIcon />
            </Link>
          </>
        }
      />

      {!data.weekEnding ? (
        <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
          No alerts have arrived yet, so there&apos;s no week to review. Once your first TradingView alert fires,
          this page summarises it automatically.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-panel p-5" aria-label="Triggers this week">
              <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Triggers this week</h2>
              <div className="flex flex-col gap-3">
                {(["IN", "US"] as const).map((market) => {
                  const t = data.triggersByMarket[market];
                  return (
                    <div key={market} className="flex flex-wrap items-center gap-2.5">
                      <span className="w-14 font-semibold">{market === "IN" ? "India" : "US"}</span>
                      <Chip variant="green">A {t.breakout.A}</Chip>
                      <Chip variant="amber">B {t.breakout.B}</Chip>
                      <Chip variant="red">C {t.breakout.C}</Chip>
                      <Chip variant="neutral">Pullbacks {t.pullback}</Chip>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-panel p-5" aria-label="Focus sectors">
              <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">
                Focus sectors · how they changed
              </h2>
              {data.focusSectorChanges.length === 0 ? (
                <p className="text-sm text-muted">No focus-starred sectors this week.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.focusSectorChanges.map((c) => (
                    <div key={`${c.market}-${c.sector}`} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        <span className="text-muted">{c.market === "IN" ? "India" : "US"} ·</span>{" "}
                        <span className="font-medium">{c.sector}</span>
                      </span>
                      {c.status === "new" && <Chip variant="gold">★ New focus</Chip>}
                      {c.status === "continuing" && <Chip variant="green">Still focus</Chip>}
                      {c.status === "dropped" && <Chip variant="red">Dropped</Chip>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="rounded-xl border border-border bg-panel p-5" aria-label="Trades this week">
            <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Trades this week</h2>
            <div className="mb-3.5 flex flex-wrap gap-5 text-sm">
              <span>
                <span className="text-muted">Opened:</span> <span className="font-semibold">{data.tradesOpened.length}</span>
              </span>
              <span>
                <span className="text-muted">Closed:</span> <span className="font-semibold">{data.tradesClosed.length}</span>
              </span>
              <span>
                <span className="text-muted">Win rate this week:</span>{" "}
                <span className="font-semibold">
                  {data.winRateThisWeek !== null ? `${data.winRateThisWeek.toFixed(0)}%` : "—"}
                </span>
              </span>
              <span>
                <span className="text-muted">Realised P&amp;L:</span>{" "}
                <span className={data.realizedPnlByMarket.IN >= 0 ? "text-pos" : "text-neg"}>
                  {formatMoney("IN", data.realizedPnlByMarket.IN)}
                </span>{" "}
                /{" "}
                <span className={data.realizedPnlByMarket.US >= 0 ? "text-pos" : "text-neg"}>
                  {formatMoney("US", data.realizedPnlByMarket.US)}
                </span>
              </span>
            </div>
            {data.tradesClosed.length === 0 ? (
              <p className="text-sm text-muted">No trades closed this week.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted">
                      <th className="px-3 py-2 text-left font-semibold">Stock</th>
                      <th className="px-3 py-2 text-left font-semibold">Sell date</th>
                      <th className="px-3 py-2 text-right font-semibold">P&amp;L</th>
                      <th className="px-3 py-2 text-right font-semibold">P&amp;L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tradesClosed.map((trade) => {
                      const abs = (trade.sell_price! - trade.buy_price) * trade.quantity;
                      const pct = ((trade.sell_price! - trade.buy_price) / trade.buy_price) * 100;
                      const exchange = data.exchangeByTicker[trade.ticker] ?? null;
                      return (
                        <tr key={trade.id} className="border-b border-border/60 last:border-b-0">
                          <td className="px-3 py-2">
                            {exchange ? (
                              <TradingViewLink exchange={exchange} ticker={trade.ticker} />
                            ) : (
                              <span className="font-semibold">{trade.ticker}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{trade.sell_date}</td>
                          <td className={`px-3 py-2 text-right ${abs >= 0 ? "text-pos" : "text-neg"}`}>
                            {formatMoney(trade.market, abs)}
                          </td>
                          <td className={`px-3 py-2 text-right ${pct >= 0 ? "text-pos" : "text-neg"}`}>
                            {formatPct(pct)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <ReflectionBox weekEnding={data.weekEnding} initialText={data.reflection} />
        </>
      )}
    </>
  );
}

import { Sparkline } from "@/components/sectors/Sparkline";
import type { Market } from "@/lib/db/schema-types";
import { formatMoney, formatPct } from "@/lib/format-money";
import type { TradeStatsSummary } from "@/lib/trade-stats";

function Card({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tracking-tight ${tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-text"}`}>
        {value}
      </div>
    </div>
  );
}

export function StatsCards({ market, stats }: { market: Market; stats: TradeStatsSummary }) {
  if (stats.tradeCount === 0) {
    return (
      <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
        No closed trades in this time frame yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card label="Win rate" value={stats.winRate !== null ? `${stats.winRate.toFixed(0)}%` : "—"} />
        <Card label="Avg win" value={formatPct(stats.avgGainPct)} tone="pos" />
        <Card label="Avg loss" value={formatPct(stats.avgLossPct)} tone="neg" />
        <Card
          label="Expectancy / trade"
          value={formatPct(stats.expectancyPct)}
          tone={stats.expectancyPct !== null && stats.expectancyPct >= 0 ? "pos" : "neg"}
        />
        <Card
          label="Profit factor"
          value={stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : "—"}
          tone={stats.profitFactor !== null && stats.profitFactor >= 1 ? "pos" : undefined}
        />
        <Card label="Best trade" value={formatPct(stats.bestTradePct)} tone="pos" />
        <Card label="Worst trade" value={formatPct(stats.worstTradePct)} tone="neg" />
        <Card label="Avg holding days" value={stats.avgHoldingDays !== null ? stats.avgHoldingDays.toFixed(0) : "—"} />
        <Card label="Max drawdown" value={formatMoney(market, -Math.abs(stats.maxDrawdown))} tone="neg" />
        <Card
          label="Realised P&L"
          value={formatMoney(market, stats.realizedPnl)}
          tone={stats.realizedPnl >= 0 ? "pos" : "neg"}
        />
      </div>

      {stats.equityCurve.length >= 2 && (
        <div className="rounded-xl border border-border bg-panel p-4.5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Equity curve</div>
          <Sparkline
            values={stats.equityCurve.map((p) => p.cumulativePnl)}
            label="Cumulative realised P&L over time"
          />
        </div>
      )}
    </div>
  );
}

import { formatMoney, formatPct } from "@/lib/format-money";
import type { Market } from "@/lib/db/schema-types";
import type { PeriodChange } from "@/lib/mutual-fund-stats";

/**
 * A labeled "vs last month"/"vs same month last year" change tile, shared
 * by every Overview dashboard that shows one (Mutual Funds, NPS, US
 * Trading Capital, Net Worth) - was copy-pasted identically into all
 * three per-entity dashboards until Net Worth needed a fourth copy.
 */
export function ChangeLine({
  label,
  change,
  market,
  title,
}: {
  label: string;
  change: PeriodChange | null;
  market: Market;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted" title={title}>
        {label}
      </div>
      {change === null ? (
        <div className="mt-1 text-sm text-muted">—</div>
      ) : (
        <div
          className={`mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[17px] font-semibold tabular-nums ${change.valueChangeAbs >= 0 ? "text-pos" : "text-neg"}`}
        >
          <span>{formatMoney(market, change.valueChangeAbs)}</span>
          <span className="min-w-0 truncate text-sm font-medium" title={`(${formatPct(change.valueChangePct)})`}>
            ({formatPct(change.valueChangePct)})
          </span>
        </div>
      )}
    </div>
  );
}

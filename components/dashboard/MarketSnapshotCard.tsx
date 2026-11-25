import type { MarketSnapshotItem } from "@/lib/market-snapshot";

function fmtValue(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtChange(changePct: number | null): string {
  if (changePct === null) return "";
  return `${changePct >= 0 ? "▲ +" : "▼ "}${changePct.toFixed(2)}%`;
}

function IndexRow({ item }: { item: MarketSnapshotItem }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted">{item.label}</span>
      {item.unavailable ? (
        <span className="text-xs text-muted">unavailable</span>
      ) : (
        <span className="flex items-baseline gap-2 tabular-nums">
          <b className="text-[15px] font-semibold">{fmtValue(item.value)}</b>
          <span className={`text-xs ${item.changePct !== null && item.changePct >= 0 ? "text-pos" : "text-neg"}`}>
            {fmtChange(item.changePct)}
          </span>
        </span>
      )}
    </div>
  );
}

/** Classic IBD severity ramp: 0-2 is normal market noise, 3-4 worth watching, 5+ a real distribution-day warning. */
function DistributionDaysLine({ count }: { count: number | null }) {
  if (count === null) return null;
  const colorClass = count >= 5 ? "text-neg" : count >= 3 ? "text-warn" : "text-muted";
  return (
    <p className={`mt-2 text-xs ${colorClass}`}>
      Distribution days (25 sessions): <b className="tabular-nums">{count}</b>
      {count >= 5 && " — elevated institutional selling"}
    </p>
  );
}

/** Dashboard's "Market snapshot" widget - broad index levels, not individual stocks. Replaces the old Open trades/P&L widget (that data already lives on the Journal page). */
export function MarketSnapshotCard({
  india,
  us,
  indiaDistributionDays,
  usDistributionDays,
}: {
  india: MarketSnapshotItem[];
  us: MarketSnapshotItem[];
  indiaDistributionDays: number | null;
  usDistributionDays: number | null;
}) {
  const anyIndiaUnavailable = india.some((i) => i.unavailable);
  return (
    <section className="rounded-xl border border-border bg-panel p-4.5" aria-label="Market snapshot">
      <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">Market snapshot</h2>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          <h3 className="mb-1 text-sm font-semibold">India</h3>
          <div className="divide-y divide-border/60">
            {india.map((item) => (
              <IndexRow key={item.label} item={item} />
            ))}
          </div>
          {anyIndiaUnavailable && (
            <p className="mt-2 text-xs text-muted">Connect Zerodha in Settings to see India index levels.</p>
          )}
          <DistributionDaysLine count={indiaDistributionDays} />
        </div>
        <div className="flex-1">
          <h3 className="mb-1 text-sm font-semibold">US</h3>
          <div className="divide-y divide-border/60">
            {us.map((item) => (
              <IndexRow key={item.label} item={item} />
            ))}
          </div>
          <DistributionDaysLine count={usDistributionDays} />
        </div>
      </div>
    </section>
  );
}

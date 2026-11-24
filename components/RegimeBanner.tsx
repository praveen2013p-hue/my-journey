import type { MarketRegime } from "@/lib/regime";

/** BRIEF.md §8: a red banner only, at the top of the content area, no blocking/dimming. */
export function RegimeBanner({ india, us }: { india: MarketRegime; us: MarketRegime }) {
  const weak = [
    ...(india.isWeak ? [{ label: "India", stage: india.stage }] : []),
    ...(us.isWeak ? [{ label: "US", stage: us.stage }] : []),
  ];

  if (weak.length === 0) return null;

  const text = weak
    .map((w) => `${w.label} market is in Stage ${w.stage} — weak regime`)
    .join(". ");

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-[10px] border border-neg-border bg-neg-wash px-4 py-3 font-medium text-neg"
    >
      <span>{text}. Trade smaller and be selective.</span>
      <span className="rounded-full border border-neg-border bg-neg-wash px-2.5 py-0.5 text-xs font-semibold">
        ● Warning only
      </span>
    </div>
  );
}

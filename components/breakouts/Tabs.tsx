import Link from "next/link";
import { Chip } from "@/components/Chip";
import type { Market, SignalType } from "@/lib/db/schema-types";

export function BreakoutsTabs({
  active,
  tabCounts,
  queryString,
}: {
  active: SignalType;
  tabCounts: Record<SignalType, Record<Market, number>>;
  queryString: string;
}) {
  const suffix = queryString ? `?${queryString}` : "";

  function label(signalType: SignalType) {
    const counts = tabCounts[signalType];
    return `${counts.IN} India · ${counts.US} US`;
  }

  return (
    <div className="flex gap-1.5 border-b border-border" role="tablist">
      <Link
        href={`/breakouts${suffix}`}
        className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 font-semibold ${
          active === "breakout" ? "border-gold text-gold-light" : "border-transparent text-muted hover:text-text"
        }`}
      >
        Breakouts <Chip variant="neutral">{label("breakout")}</Chip>
      </Link>
      <Link
        href={`/pullbacks${suffix}`}
        className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 font-semibold ${
          active === "pullback" ? "border-gold text-gold-light" : "border-transparent text-muted hover:text-text"
        }`}
      >
        Pullbacks <Chip variant="neutral">{label("pullback")}</Chip>
      </Link>
    </div>
  );
}

import Link from "next/link";
import { Chip } from "@/components/Chip";
import type { TriggerCounts } from "@/lib/dashboard-data";
import type { Market } from "@/lib/db/schema-types";

function breakoutsHref(market: Market, weekEnding: string | null, grade?: "A" | "B" | "C") {
  const params = new URLSearchParams({ market });
  if (weekEnding) params.set("week", weekEnding);
  if (grade) params.set("grades", grade);
  return `/breakouts?${params.toString()}`;
}

function pullbacksHref(market: Market, weekEnding: string | null) {
  const params = new URLSearchParams({ market });
  if (weekEnding) params.set("week", weekEnding);
  return `/pullbacks?${params.toString()}`;
}

function MarketRow({
  label,
  market,
  weekEnding,
  grades,
}: {
  label: string;
  market: Market;
  weekEnding: string | null;
  grades: { A: number; B: number; C: number };
}) {
  const total = grades.A + grades.B + grades.C;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href={breakoutsHref(market, weekEnding)} prefetch={false} className="group">
        <div className="text-xs text-muted group-hover:text-text">{label} · breakouts</div>
        <div className="text-[30px] font-semibold tabular-nums group-hover:text-gold-light">{total}</div>
      </Link>
      <div className="flex gap-2">
        <Link href={breakoutsHref(market, weekEnding, "A")} prefetch={false}>
          <Chip variant="green">● A {grades.A}</Chip>
        </Link>
        <Link href={breakoutsHref(market, weekEnding, "B")} prefetch={false}>
          <Chip variant="amber">● B {grades.B}</Chip>
        </Link>
        <Link href={breakoutsHref(market, weekEnding, "C")} prefetch={false}>
          <Chip variant="red">● C {grades.C}</Chip>
        </Link>
      </div>
    </div>
  );
}

export function TriggersCard({ triggers, weekEnding }: { triggers: TriggerCounts; weekEnding: string | null }) {
  return (
    <section className="rounded-xl border border-border bg-panel p-4.5" aria-label="This week's triggers">
      <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">This week&apos;s triggers</h2>
      <div className="flex flex-col gap-4">
        <MarketRow label="India" market="IN" weekEnding={weekEnding} grades={triggers.breakout.IN} />
        <MarketRow label="US" market="US" weekEnding={weekEnding} grades={triggers.breakout.US} />
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>Pullbacks this week:</span>
          <Link href={pullbacksHref("IN", weekEnding)} prefetch={false} className="hover:text-gold-light hover:underline">
            India {triggers.pullback.IN}
          </Link>
          <Link href={pullbacksHref("US", weekEnding)} prefetch={false} className="hover:text-gold-light hover:underline">
            US {triggers.pullback.US}
          </Link>
        </div>
      </div>
    </section>
  );
}

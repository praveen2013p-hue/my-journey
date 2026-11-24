import { Chip } from "@/components/Chip";
import type { TriggerCounts } from "@/lib/dashboard-data";

function MarketRow({ label, grades }: { label: string; grades: { A: number; B: number; C: number } }) {
  const total = grades.A + grades.B + grades.C;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-xs text-muted">{label} · breakouts</div>
        <div className="text-[30px] font-semibold tabular-nums">{total}</div>
      </div>
      <div className="flex gap-2">
        <Chip variant="green">● A {grades.A}</Chip>
        <Chip variant="amber">● B {grades.B}</Chip>
        <Chip variant="red">● C {grades.C}</Chip>
      </div>
    </div>
  );
}

export function TriggersCard({ triggers }: { triggers: TriggerCounts }) {
  return (
    <section className="rounded-xl border border-border bg-panel p-4.5" aria-label="This week's triggers">
      <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">This week&apos;s triggers</h2>
      <div className="flex flex-col gap-4">
        <MarketRow label="India" grades={triggers.breakout.IN} />
        <MarketRow label="US" grades={triggers.breakout.US} />
        <div className="text-xs text-muted">
          Pullbacks this week: India {triggers.pullback.IN} · US {triggers.pullback.US}
        </div>
      </div>
    </section>
  );
}

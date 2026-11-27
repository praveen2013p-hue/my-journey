import { Chip } from "@/components/Chip";
import type { TopSector } from "@/lib/dashboard-data";
import { colorForSigned } from "@/lib/format-money";

export function TopSectorsCard({ sectors }: { sectors: TopSector[] }) {
  return (
    <section className="rounded-xl border border-border bg-panel p-4.5" aria-label="Top sectors">
      <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-wider text-muted">
        Top sectors · Stage 2 + RS improving
      </h2>
      {sectors.length === 0 ? (
        <p className="text-sm text-muted">
          No focus-starred sectors yet this week - they show up once your sector board history has a few weeks in
          it.
        </p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {sectors.map((s, i) => (
            <li key={`${s.market}-${s.sector}`} className="flex items-center justify-between gap-2.5 text-sm">
              <span className="flex items-center gap-2.5">
                <span className="tabular-nums text-muted">{i + 1}</span>
                <span className="text-gold-light">★</span>
                <span className="font-medium">{s.sector}</span>
                <Chip variant="neutral">{s.market}</Chip>
              </span>
              <span className={`tabular-nums ${colorForSigned(s.mrs)}`}>
                RS {s.mrs !== null ? (s.mrs > 0 ? "+" : "") + s.mrs.toFixed(1) : "—"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

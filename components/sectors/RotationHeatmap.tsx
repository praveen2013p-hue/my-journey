import type { SectorRotationMatrix } from "@/lib/sector-rotation";

/** Rank-based heat color: top third of sectors green, bottom third red, middle neutral. */
function cellClass(rank: number | null, totalSectors: number): string {
  if (rank === null) return "bg-panel text-muted";
  const pct = rank / totalSectors;
  if (pct <= 1 / 3) return "bg-pos-wash text-pos";
  if (pct >= 2 / 3) return "bg-neg-wash text-neg";
  return "bg-warn-wash text-warn";
}

/** "Sector rotation": each sector's RS rank by week, as a grid - shows money flow between sectors over time. */
export function RotationHeatmap({ matrix }: { matrix: SectorRotationMatrix }) {
  if (matrix.weeks.length === 0 || matrix.sectors.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">
        Not enough weekly history yet to show sector rotation.
      </div>
    );
  }

  const totalSectors = matrix.sectors.length;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-panel">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="sticky left-0 bg-panel px-3 py-2 text-left font-semibold text-muted">
              Sector
            </th>
            {matrix.weeks.map((week) => (
              <th key={week} scope="col" className="whitespace-nowrap px-2 py-2 text-center font-semibold text-muted">
                {week.slice(5)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.sectors.map((sector) => (
            <tr key={sector} className="border-b border-row-border last:border-0">
              <td className="sticky left-0 whitespace-nowrap bg-panel px-3 py-1.5 font-medium">{sector}</td>
              {matrix.weeks.map((week) => {
                const rank = matrix.ranks[sector]?.[week] ?? null;
                return (
                  <td key={week} className="px-2 py-1.5 text-center">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded tabular-nums ${cellClass(rank, totalSectors)}`}>
                      {rank ?? "—"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

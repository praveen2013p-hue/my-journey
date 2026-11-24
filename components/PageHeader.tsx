import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.2px]">{title}</h1>
        {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function PhaseStub({ title, phase, note }: { title: string; phase: number; note: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Coming in Phase {phase}
      </h2>
      <p className="text-sm text-muted">{note}</p>
      <p className="mt-1 text-xs text-muted">({title} — see BRIEF.md for the full spec of this page.)</p>
    </div>
  );
}

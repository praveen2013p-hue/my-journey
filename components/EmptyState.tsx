/** The "nothing to show yet" box - identical markup was copy-pasted across 10+ files, only the message differed. */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-panel p-6 text-sm text-muted">{children}</div>;
}

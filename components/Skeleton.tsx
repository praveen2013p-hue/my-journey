/**
 * Shared loading-skeleton building blocks for each route's `loading.tsx`
 * (Part 1 performance work - "show a loading skeleton while data loads,
 * so the page never feels frozen"). Plain pulsing blocks in the app's own
 * panel/border colours - no new design language.
 */

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-panel-alt ${className}`} />;
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-panel p-4.5">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-2.5 h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel">
      <div className="border-b border-border px-3 py-2.5">
        <SkeletonBlock className="h-4 w-full max-w-md" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-row-border px-3 py-3 last:border-0">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-4 w-12" />
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStrip() {
  return <SkeletonBlock className="h-10 w-full" />;
}

export function SkeletonHeader() {
  return <SkeletonBlock className="h-7 w-48" />;
}

/**
 * A simple global rate limiter: at most `perSecond` calls start in any
 * rolling second, the rest queued - for Kite's documented ~3 requests/
 * second limit on historical candles (BRIEF.md §7.2/§11/§17.5), shared
 * across every caller regardless of which page or job triggered them
 * (sector-metrics recompute, Performance's shortlist, price-history
 * backfill can all be in flight at once).
 *
 * One shared timer, not one per queued call - lazily (re)armed only
 * while the queue is non-empty, so an idle limiter leaves nothing
 * running between bursts (serverless-friendly).
 */
export function createRateLimiter(perSecond: number) {
  let tokens = perSecond;
  let lastRefill = Date.now();
  const queue: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function drain(): void {
    while (tokens > 0 && queue.length > 0) {
      tokens--;
      queue.shift()!();
    }
  }

  function tick(): void {
    timer = null;
    tokens = perSecond;
    lastRefill = Date.now();
    drain();
    ensureTimer();
  }

  function ensureTimer(): void {
    if (timer !== null || queue.length === 0) return;
    const elapsed = Date.now() - lastRefill;
    timer = setTimeout(tick, Math.max(0, 1000 - elapsed));
  }

  return function schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        fn().then(resolve, reject);
      };

      const now = Date.now();
      if (now - lastRefill >= 1000) {
        tokens = perSecond;
        lastRefill = now;
      }

      if (tokens > 0) {
        tokens--;
        run();
      } else {
        queue.push(run);
        ensureTimer();
      }
    });
  };
}

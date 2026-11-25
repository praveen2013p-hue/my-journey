/**
 * Tiny in-memory TTL cache for a per-request async computation keyed by a
 * small, stable key (a Market, say) - the same pattern lib/regime.ts already
 * proved out for the market-regime light. Used for anything that calls a
 * live provider (Yahoo/Kite) on every page view: a stale-by-a-few-minutes
 * value is still correct at this app's swing-trading cadence, and it's far
 * better than blocking (or breaking) a page render on a provider that's slow
 * or temporarily unreachable (BRIEF.md §17.5's "never break pages").
 */
export function createTtlCache<K, V>(ttlMs: number) {
  const cache = new Map<K, { value: V; cachedAt: number }>();

  async function getOrCompute(key: K, compute: () => Promise<V>): Promise<V> {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.cachedAt < ttlMs) {
      return cached.value;
    }
    const value = await compute();
    // A failed/empty result is still cached - a down provider shouldn't mean
    // a slow (or hanging) call on every single page load until it recovers.
    cache.set(key, { value, cachedAt: Date.now() });
    return value;
  }

  function clear(): void {
    cache.clear();
  }

  return { getOrCompute, clear };
}

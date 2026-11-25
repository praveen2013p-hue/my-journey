import { describe, expect, it, vi } from "vitest";
import { createTtlCache } from "./ttl-cache";

describe("createTtlCache", () => {
  it("only calls compute once for repeated calls within the TTL", async () => {
    const cache = createTtlCache<string, number>(1000);
    const compute = vi.fn().mockResolvedValue(42);

    expect(await cache.getOrCompute("a", compute)).toBe(42);
    expect(await cache.getOrCompute("a", compute)).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes once the TTL has elapsed", async () => {
    vi.useFakeTimers();
    try {
      const cache = createTtlCache<string, number>(1000);
      const compute = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

      expect(await cache.getOrCompute("a", compute)).toBe(1);
      vi.advanceTimersByTime(1001);
      expect(await cache.getOrCompute("a", compute)).toBe(2);
      expect(compute).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps separate keys independent", async () => {
    const cache = createTtlCache<string, number>(1000);
    expect(await cache.getOrCompute("a", async () => 1)).toBe(1);
    expect(await cache.getOrCompute("b", async () => 2)).toBe(2);
  });

  it("caches a resolved-but-empty/failed-lookup result too, not just a successful one", async () => {
    const cache = createTtlCache<string, number | null>(1000);
    const compute = vi.fn().mockResolvedValue(null);
    expect(await cache.getOrCompute("a", compute)).toBeNull();
    expect(await cache.getOrCompute("a", compute)).toBeNull();
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("clear() forces the next call to recompute", async () => {
    const cache = createTtlCache<string, number>(1000);
    const compute = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.getOrCompute("a", compute)).toBe(1);
    cache.clear();
    expect(await cache.getOrCompute("a", compute)).toBe(2);
  });
});

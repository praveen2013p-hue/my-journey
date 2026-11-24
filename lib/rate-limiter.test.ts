import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rate-limiter";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createRateLimiter", () => {
  it("runs up to perSecond calls right away and queues the rest", async () => {
    const limit = createRateLimiter(2);
    const order: number[] = [];
    const call = (i: number) => () => {
      order.push(i);
      return Promise.resolve(i);
    };

    const p1 = limit(call(1));
    const p2 = limit(call(2));
    const p3 = limit(call(3));

    expect(order).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(order).toEqual([1, 2, 3]);

    await expect(Promise.all([p1, p2, p3])).resolves.toEqual([1, 2, 3]);
  });

  it("never runs more than perSecond calls within any one second window", async () => {
    const limit = createRateLimiter(3);
    const order: number[] = [];
    for (let i = 0; i < 7; i++) {
      limit(() => {
        order.push(i);
        return Promise.resolve(i);
      });
    }

    expect(order).toEqual([0, 1, 2]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("propagates a rejection without blocking later calls", async () => {
    const limit = createRateLimiter(1);
    const p1 = limit(() => Promise.reject(new Error("boom")));
    const p2 = limit(() => Promise.resolve("ok"));

    await expect(p1).rejects.toThrow("boom");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p2).resolves.toBe("ok");
  });
});

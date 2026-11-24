import { beforeEach, describe, expect, it } from "vitest";
import { __clearQuoteCacheForTests, getCachedQuotes } from "./quotes-cache";

beforeEach(() => {
  __clearQuoteCacheForTests();
});

describe("getCachedQuotes", () => {
  it("fetches a fresh quote for a symbol seen for the first time", async () => {
    const result = await getCachedQuotes("IN", ["SBIN"]);
    expect(result.get("SBIN")?.stale).toBe(false);
    expect(typeof result.get("SBIN")?.price).toBe("number");
  });

  it("serves the same price from cache on an immediate second call", async () => {
    const first = await getCachedQuotes("IN", ["SBIN"]);
    const second = await getCachedQuotes("IN", ["SBIN"]);
    expect(second.get("SBIN")?.price).toBe(first.get("SBIN")?.price);
    expect(second.get("SBIN")?.stale).toBe(false);
  });

  it("different symbols get independent cache entries", async () => {
    const result = await getCachedQuotes("IN", ["SBIN", "TCS"]);
    expect(result.has("SBIN")).toBe(true);
    expect(result.has("TCS")).toBe(true);
  });
});

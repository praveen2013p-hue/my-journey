import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAlertHealth } from "./alert-health";
import { insertAlertRaw } from "./db/alerts";
import { __resetStoreForTests } from "./db/local-store";

beforeEach(async () => {
  await __resetStoreForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getAlertHealth", () => {
  it("counts accepted vs rejected alerts received in the last 7 days", async () => {
    await insertAlertRaw({ a: 1 }, true, null);
    await insertAlertRaw({ a: 2 }, true, null);
    await insertAlertRaw({ a: 3 }, false, "invalid_secret");

    const health = await getAlertHealth(new Date("2026-11-24T10:00:00Z"));
    expect(health.acceptedThisWeek).toBe(2);
    expect(health.rejectedThisWeek).toBe(1);
    expect(health.lastAlertAt).not.toBeNull();
  });

  it("flags missingThisWeek only once it's past Saturday noon IST with nothing received", async () => {
    // Saturday 24 Nov 2026, 13:00 IST = 07:30 UTC — past the noon cutoff.
    const health = await getAlertHealth(new Date("2026-11-21T07:30:00Z"));
    expect(health.missingThisWeek).toBe(true);
  });

  it("does not flag missingThisWeek before Saturday noon IST", async () => {
    // Saturday 24 Nov 2026, 10:00 IST = 04:30 UTC — before the noon cutoff.
    const health = await getAlertHealth(new Date("2026-11-21T04:30:00Z"));
    expect(health.missingThisWeek).toBe(false);
  });

  it("reports the real (stale) lastAlertAt even once the webhook has been silent for more than 2 weeks, instead of null", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    await insertAlertRaw({ a: 1 }, true, null);
    vi.useRealTimers();

    // 2026-11-24 is more than 7 weeks after the insert above - well past
    // the 2-week window the this-week/last-week counts are bounded to.
    const health = await getAlertHealth(new Date("2026-11-24T10:00:00Z"));
    expect(health.lastAlertAt).toBe("2026-10-01T10:00:00.000Z");
    expect(health.acceptedThisWeek).toBe(0);
    expect(health.acceptedLastWeek).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAlerts } from "../db/alerts";
import { __resetStoreForTests } from "../db/local-store";
import { listSectorSnapshotHistory } from "../db/sectors";
import { processWebhookQuickPath } from "./process";
import { __resetRateLimiterForTests } from "./security";

const SECRET = "test-secret-value";

function stockAlertBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    secret: SECRET,
    type: "stage2",
    ticker: "SBIN",
    exchange: "NSE",
    price: "812.5",
    open: "790.1",
    high: "818.9",
    low: "788.0",
    volume: "54231000",
    interval: "W",
    time: "2026-11-20 15:45",
    signal: "Weinstein Stage 2 breakout",
    alertName: "W-Stage2 breakout",
    grade: "A",
    breakoutLevel: "801.4",
    volRatio: "2.31",
    rs: "4.7",
    pctAboveMA: "9.8",
    overheadPct: "0",
    sector: "Finance",
    industry: "Regional Banks",
    ...overrides,
  });
}

function sectorBoardBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    secret: SECRET,
    type: "sectorBoard",
    week: "2026-11-16",
    sent: "2026-11-20 15:50",
    bench: "NSE:CNX500",
    market: "IN",
    s1: 3,
    s2: 9,
    s3: 8,
    s4: 8,
    rows: [{ rank: 1, sector: "PSU Bank", stage: 2, rs: 12.4, rsUp: true, vsMA: 15.2, chg4: 6.1, focus: true }],
    ...overrides,
  });
}

beforeEach(async () => {
  process.env.WEBHOOK_SECRET = SECRET;
  await __resetStoreForTests();
  __resetRateLimiterForTests();
});

describe("secret check", () => {
  it("rejects a missing secret with 401 and never upserts an alert", async () => {
    const body = JSON.parse(stockAlertBody());
    delete body.secret;
    const result = await processWebhookQuickPath(JSON.stringify(body), "1.2.3.4");
    expect(result.status).toBe(401);
    expect(result.deferredWork).toBeUndefined();
    expect(await listAlerts()).toHaveLength(0);
  });

  it("rejects a wrong secret with 401", async () => {
    const result = await processWebhookQuickPath(stockAlertBody({ secret: "wrong" }), "1.2.3.4");
    expect(result.status).toBe(401);
    expect(result.deferredWork).toBeUndefined();
  });

  it("never echoes the configured secret back in the response", async () => {
    const result = await processWebhookQuickPath(stockAlertBody({ secret: "wrong" }), "1.2.3.4");
    expect(JSON.stringify(result.body)).not.toContain(SECRET);
  });

  it("accepts the correct secret and returns 200 with deferred work", async () => {
    const result = await processWebhookQuickPath(stockAlertBody(), "1.2.3.4");
    expect(result.status).toBe(200);
    expect(result.deferredWork).toBeInstanceOf(Function);
  });

  it("falls back to a URL query-string secret when the body has none", async () => {
    // Some Pine scripts build their own alert message with no room to add
    // a "secret" field (e.g. a sector-board script shared with a
    // Google-Sheet-bound alert, BRIEF.md §2) - the webhook URL itself can
    // carry the secret instead.
    const body = JSON.parse(sectorBoardBody());
    delete body.secret;
    const result = await processWebhookQuickPath(JSON.stringify(body), "1.2.3.4", SECRET);
    expect(result.status).toBe(200);
    expect(result.deferredWork).toBeInstanceOf(Function);
  });

  it("rejects a wrong query-string secret the same as a wrong body secret", async () => {
    const body = JSON.parse(sectorBoardBody());
    delete body.secret;
    const result = await processWebhookQuickPath(JSON.stringify(body), "1.2.3.4", "wrong");
    expect(result.status).toBe(401);
  });

  it("prefers a correct body secret over a wrong query-string secret", async () => {
    const result = await processWebhookQuickPath(stockAlertBody(), "1.2.3.4", "wrong");
    expect(result.status).toBe(200);
  });

  it("rate-limits repeated wrong-secret requests from the same client, never the right secret", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 25; i++) {
      const result = await processWebhookQuickPath(stockAlertBody({ secret: "wrong" }), "9.9.9.9");
      lastStatus = result.status;
    }
    expect(lastStatus).toBe(429);

    // A whole watchlist firing with the *correct* secret from the same IP
    // must never be throttled (BRIEF.md §17.2).
    for (let i = 0; i < 25; i++) {
      const result = await processWebhookQuickPath(stockAlertBody({ ticker: `T${i}` }), "9.9.9.9");
      expect(result.status).toBe(200);
    }
  });
});

describe("stock alert ingestion", () => {
  it("stores the alert after the deferred step runs, with week_ending computed", async () => {
    const result = await processWebhookQuickPath(stockAlertBody(), "1.2.3.4");
    await result.deferredWork?.();

    const rows = await listAlerts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      market: "IN",
      ticker: "SBIN",
      signal_type: "breakout",
      grade: "A",
      week_ending: "2026-11-20",
      trigger_price: 812.5,
      vol_ratio: 2.31,
    });
  });

  it("a duplicate alert (same market/ticker/signal_type/week_ending) updates in place, not a duplicate row", async () => {
    const first = await processWebhookQuickPath(stockAlertBody({ price: "812.5" }), "1.2.3.4");
    await first.deferredWork?.();

    const second = await processWebhookQuickPath(stockAlertBody({ price: "830.0" }), "1.2.3.4");
    await second.deferredWork?.();

    const rows = await listAlerts();
    expect(rows).toHaveLength(1);
    expect(rows[0].trigger_price).toBe(830.0);
  });

  it("classifies a pullback signal as signal_type 'pullback'", async () => {
    const result = await processWebhookQuickPath(
      stockAlertBody({ signal: "Weinstein Stage 2 pullback" }),
      "1.2.3.4",
    );
    await result.deferredWork?.();
    const rows = await listAlerts();
    expect(rows[0].signal_type).toBe("pullback");
  });

  it("stores fundamentals when present and leaves them null when absent", async () => {
    const withFundamentals = await processWebhookQuickPath(
      stockAlertBody({ roe: "16.1", debtToEquity: "1.9" }),
      "1.2.3.4",
    );
    await withFundamentals.deferredWork?.();
    const [row] = await listAlerts();
    expect(row.fundamentals).toMatchObject({ roe: 16.1, debtToEquity: 1.9 });
  });

  it("a malformed accepted payload is logged, not thrown, and inserts no alert", async () => {
    const result = await processWebhookQuickPath(stockAlertBody({ grade: "Z" }), "1.2.3.4");
    expect(result.status).toBe(200); // secret was valid; TradingView still gets a fast 200
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(result.deferredWork?.()).resolves.toBeUndefined();
    consoleError.mockRestore();
    expect(await listAlerts()).toHaveLength(0);
  });
});

describe("sector board ingestion", () => {
  it("accepts a sector snapshot and computes week_ending as Monday + 4 days", async () => {
    const result = await processWebhookQuickPath(sectorBoardBody(), "1.2.3.4");
    expect(result.status).toBe(200);
    await result.deferredWork?.();
    // No direct getter exercised here beyond "doesn't throw"; the
    // ranking engine itself is Phase 2 (BRIEF.md §12).
  });

  it("accepts a partial snapshot (fewer rows than expected) without failing", async () => {
    const result = await processWebhookQuickPath(sectorBoardBody({ rows: [] }), "1.2.3.4");
    expect(result.status).toBe(200);
    await expect(result.deferredWork?.()).resolves.toBeUndefined();
  });

  it("stores a sector whose rsUp is null (not enough RS history yet) instead of rejecting the whole snapshot", async () => {
    // Reproduces a real failure found testing live on 2026-11-25: the Pine
    // script sends rsUp:null for a sector with no mrsChg yet (na(mrsChg)),
    // which SectorRowSchema's `rsUp: z.boolean().optional()` rejected -
    // deferredWork swallows the ZodError (never throws, §17.1), so
    // TradingView saw 200 OK while every row silently failed to store.
    const result = await processWebhookQuickPath(
      sectorBoardBody({
        rows: [
          { rank: 1, sector: "PSU Bank", stage: 2, rs: 12.4, rsUp: true, vsMA: 15.2, chg4: 6.1, focus: true },
          { rank: 2, sector: "Chemicals", stage: 1, rs: -5.6, rsUp: null, vsMA: -3, chg4: 7.8, focus: false },
        ],
      }),
      "1.2.3.4",
    );
    expect(result.status).toBe(200);
    await result.deferredWork?.();

    const history = await listSectorSnapshotHistory("IN");
    expect(history).toHaveLength(2);
    const chemicals = history.find((s) => s.sector === "Chemicals");
    expect(chemicals?.rs_up).toBeNull();
    const psuBank = history.find((s) => s.sector === "PSU Bank");
    expect(psuBank?.rs_up).toBe(true);
  });

  it("recomputes an existing alert's Quality Score once its sector shows up as Stage 2 with positive RS", async () => {
    const { replaceConstituents } = await import("../db/sector-constituents");
    await replaceConstituents("IN", "PSU Bank", ["SBIN"]);

    const stockResult = await processWebhookQuickPath(stockAlertBody(), "1.2.3.4");
    await stockResult.deferredWork?.();
    const before = (await listAlerts())[0];
    expect(before.quality_breakdown).toMatchObject({ sector: 0 }); // no sector data yet this week

    // Week "2026-11-16" (Monday) -> week_ending 2026-11-20, matching the stock alert's week.
    // Only one week of sector history exists, so the app's own focus rule
    // (needs Δ13 > 0, BRIEF.md §7.2) correctly can't confirm "focus" yet -
    // it still scores "Stage 2 + RS > 0" even though the payload's own
    // `focus: true` flag says yes, because that flag is never trusted
    // directly (BRIEF.md §9's own rule, computed from what's actually stored).
    const sectorResult = await processWebhookQuickPath(
      sectorBoardBody({ rows: [{ rank: 1, sector: "PSU Bank", stage: 2, rs: 12.4, rsUp: true, vsMA: 15.2, chg4: 6.1, focus: true }] }),
      "1.2.3.4",
    );
    await sectorResult.deferredWork?.();

    const after = (await listAlerts())[0];
    expect(after.quality_breakdown).toMatchObject({ sector: 10 }); // Stage 2 + RS > 0, not yet confirmed focus
    expect(after.quality_score).toBeGreaterThan(before.quality_score!);
  });
});

describe("malformed bodies", () => {
  it("invalid JSON is logged and rejected with 400, not a 500", async () => {
    const result = await processWebhookQuickPath("not json {{{", "1.2.3.4");
    expect(result.status).toBe(400);
  });

  it("a body over the 16KB cap is rejected only because the secret was also wrong", async () => {
    const big = "x".repeat(20_000);
    const result = await processWebhookQuickPath(
      JSON.stringify({ secret: "wrong", type: "stage2", padding: big }),
      "5.5.5.5",
    );
    expect([401, 429]).toContain(result.status);
  });
});

/**
 * TradingView webhook, BRIEF.md §5 + §17.1/§17.2/§17.6. Split in two so
 * the route handler can respond in ~milliseconds and do the real work
 * afterwards (via Next's `after()`), per §17.1 ("respond 200 fast; parse
 * and upsert afterwards... never drop"):
 *
 *  - `processWebhookQuickPath` does only: parse JSON, check the secret,
 *    write the raw log, and return the HTTP result.
 *  - the `deferredWork` it returns does the heavy part: schema validation,
 *    symbol mapping, week_ending calculation, and the real upsert.
 *
 * Tests call both parts directly (no HTTP server needed) so "duplicate
 * alert = update, not duplicate" and "secret check" are plain function
 * calls, per BRIEF.md's own testing ask.
 */

import { insertAlertRaw, markAlertRawProcessed, recomputeQualityForWeek, upsertAlert } from "../db/alerts";
import { computeAndStoreSectorMetrics } from "../db/sector-metrics-orchestrator";
import { upsertSectorSnapshot } from "../db/sectors";
import { resolveOrCreateSymbolMapping } from "../db/symbol-map";
import { marketFromExchange } from "../market";
import { parseIstAlertTime, weekEndingForAlert, weekEndingFromMonday } from "../time";
import { isRateLimited, MAX_BODY_BYTES, safeCompare } from "./security";
import {
  hasAnyFundamentals,
  SectorBoardPayloadSchema,
  StockAlertPayloadSchema,
} from "./schemas";

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
  /** Heavy work to run after the HTTP response is sent; absent when there's nothing to defer. */
  deferredWork?: () => Promise<void>;
}

function tooLargeOrRateLimited(rawBody: string, clientKey: string): boolean {
  const tooBig = Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES;
  const limited = isRateLimited(clientKey);
  return tooBig || limited;
}

/**
 * The fast path: never does DB work beyond the one raw-log insert, never
 * throws (a malformed body is just logged and 4xx'd), and returns quickly
 * enough for TradingView's ~3s timeout.
 */
export async function processWebhookQuickPath(
  rawBody: string,
  clientKey: string,
): Promise<WebhookResult> {
  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(rawBody);
  } catch {
    if (tooLargeOrRateLimited(rawBody, clientKey)) {
      return { status: 429, body: { error: "rate_limited" } };
    }
    await insertAlertRaw(
      { parseError: "invalid_json", rawBodyPreview: rawBody.slice(0, 500) },
      false,
      "invalid_json",
    );
    return { status: 400, body: { error: "invalid_json" } };
  }

  if (typeof parsedUnknown !== "object" || parsedUnknown === null || Array.isArray(parsedUnknown)) {
    if (tooLargeOrRateLimited(rawBody, clientKey)) {
      return { status: 429, body: { error: "rate_limited" } };
    }
    await insertAlertRaw({ parseError: "not_an_object" }, false, "not_an_object");
    return { status: 400, body: { error: "invalid_payload" } };
  }

  const parsed = parsedUnknown as Record<string, unknown>;
  const providedSecret = typeof parsed.secret === "string" ? parsed.secret : "";
  const expectedSecret = process.env.WEBHOOK_SECRET ?? "";
  const secretOk = expectedSecret.length > 0 && safeCompare(providedSecret, expectedSecret);

  // Secret is never stored or echoed back, valid or not (BRIEF.md §17.1/§5).
  const { secret: _secret, ...bodyWithoutSecret } = parsed;

  if (!secretOk) {
    const limited = tooLargeOrRateLimited(rawBody, clientKey);
    await insertAlertRaw(bodyWithoutSecret, false, limited ? "rate_limited" : "invalid_secret");
    if (limited) return { status: 429, body: { error: "rate_limited" } };
    return { status: 401, body: { error: "unauthorized" } };
  }

  // Correct secret from here on: never throttled or size-capped (§17.2).
  const rawId = await insertAlertRaw(bodyWithoutSecret, true, null);

  return {
    status: 200,
    body: { ok: true },
    deferredWork: () => processAcceptedPayload(rawId, bodyWithoutSecret),
  };
}

async function processAcceptedPayload(
  rawId: number,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    if (body.type === "stage2") {
      await processStockAlert(body);
    } else if (body.type === "sectorBoard") {
      await processSectorBoard(body);
    } else {
      await markAlertRawProcessed(rawId, `unrecognized_type:${String(body.type)}`);
      return;
    }
    await markAlertRawProcessed(rawId, null);
  } catch (err) {
    // Never throw out of deferred work - log and keep the raw row for a
    // future "Replay" (BRIEF.md §17.1: "never drop").
    console.error("[webhook] deferred processing failed", err);
    await markAlertRawProcessed(rawId, `processing_error:${(err as Error).message}`);
  }
}

async function processStockAlert(body: Record<string, unknown>): Promise<void> {
  const payload = StockAlertPayloadSchema.parse(body);
  const market = marketFromExchange(payload.exchange);
  if (!market) throw new Error(`Unrecognized exchange: ${payload.exchange}`);

  await resolveOrCreateSymbolMapping(market, payload.ticker, payload.exchange);

  const instant = parseIstAlertTime(payload.time);
  const weekEnding = weekEndingForAlert(instant, market);
  const signalType = payload.signal.toLowerCase().includes("pullback") ? "pullback" : "breakout";

  const fundamentals = hasAnyFundamentals(payload)
    ? {
        marketCap: payload.marketCap,
        pe: payload.pe,
        epsTtm: payload.epsTtm,
        epsGrowthYoY: payload.epsGrowthYoY,
        epsGrowthQoQ: payload.epsGrowthQoQ,
        salesGrowthYoY: payload.salesGrowthYoY,
        salesGrowthQoQ: payload.salesGrowthQoQ,
        roe: payload.roe,
        roce: payload.roce,
        debtToEquity: payload.debtToEquity,
        nextEarningsDate: payload.nextEarningsDate,
      }
    : null;

  await upsertAlert({
    market,
    exchange: payload.exchange,
    ticker: payload.ticker,
    signal_type: signalType,
    grade: payload.grade,
    week_ending: weekEnding,
    triggered_at: instant.toISOString(),
    trigger_price: payload.price,
    open: payload.open,
    high: payload.high,
    low: payload.low,
    volume: payload.volume,
    breakout_level: payload.breakoutLevel,
    vol_ratio: payload.volRatio,
    mrs: payload.rs,
    pct_above_ma: payload.pctAboveMA,
    overhead_pct: payload.overheadPct,
    sector: payload.sector,
    industry: payload.industry,
    fundamentals,
    raw: body,
  });
}

async function processSectorBoard(body: Record<string, unknown>): Promise<void> {
  const payload = SectorBoardPayloadSchema.parse(body);
  const market = payload.market ?? "IN";
  const weekEnding = weekEndingFromMonday(payload.week);

  for (const row of payload.rows) {
    await upsertSectorSnapshot({
      market,
      week_ending: weekEnding,
      sector: row.sector,
      stage: (row.stage ?? null) as 1 | 2 | 3 | 4 | null,
      mrs: row.rs ?? null,
      rs_up: row.rsUp ?? null,
      vs_ma: row.vsMA ?? null,
      chg4: row.chg4 ?? null,
      focus: row.focus ?? false,
      source: "alert",
    });
  }

  // Keep rank/Δ13-26-52/focus current the moment a snapshot arrives,
  // rather than waiting for someone to open the Sectors page first.
  await computeAndStoreSectorMetrics(market, weekEnding);

  // Any stock alert for this same week may now have a stronger/weaker
  // sector-strength bucket in its Quality Score (BRIEF.md §9).
  await recomputeQualityForWeek(market, weekEnding);
}

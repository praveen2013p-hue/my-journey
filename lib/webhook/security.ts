/**
 * BRIEF.md §5 / §17.2: constant-time secret check; rate-limit and
 * size-cap ONLY requests that fail that check (a correct-secret request,
 * e.g. a whole watchlist firing at once, must never be throttled).
 */

import { createHash, timingSafeEqual } from "crypto";

export const MAX_BODY_BYTES = 16 * 1024;

/** Constant-time string compare (via equal-length digests, so length itself never leaks). */
export function safeCompare(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = { windowMs: 60_000, max: 20 };

// Best-effort, per-instance only (BRIEF.md §17.5 free-tier safety; see
// DECISIONS.md) — this only needs to blunt casual scanning of a wrong-secret
// endpoint, not withstand a distributed attacker. The real security
// boundary is the secret check itself.
const hits = new Map<string, number[]>();

export function isRateLimited(
  clientKey: string,
  options: RateLimitOptions = DEFAULT_OPTIONS,
): boolean {
  const now = Date.now();
  const windowStart = now - options.windowMs;
  const timestamps = (hits.get(clientKey) ?? []).filter((t) => t > windowStart);
  timestamps.push(now);
  hits.set(clientKey, timestamps);
  return timestamps.length > options.max;
}

export function __resetRateLimiterForTests(): void {
  hits.clear();
}

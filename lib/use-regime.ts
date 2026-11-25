"use client";

import { useEffect, useState } from "react";
import type { MarketRegime } from "./regime";

export interface RegimePair {
  india: MarketRegime;
  us: MarketRegime;
}

const EMPTY_REGIME: MarketRegime = { market: "IN", stage: null, isWeak: false };
const EMPTY_PAIR: RegimePair = { india: EMPTY_REGIME, us: { ...EMPTY_REGIME, market: "US" } };

// Sidebar and RegimeCard both call this hook on the Dashboard, which used
// to mean 2 separate /api/regime fetches for identical data (4 in dev's
// Strict Mode) every single page view (DECISIONS.md). One shared in-flight
// request, plus a short client-side cache so a second mount shortly after
// (e.g. navigating back to the Dashboard) doesn't re-fetch either.
const CLIENT_CACHE_TTL_MS = 60 * 1000;
let cached: { pair: RegimePair; fetchedAt: number } | null = null;
let inFlight: Promise<RegimePair | null> | null = null;

function isFresh(entry: typeof cached): entry is NonNullable<typeof cached> {
  return entry !== null && Date.now() - entry.fetchedAt < CLIENT_CACHE_TTL_MS;
}

function fetchRegimePair(): Promise<RegimePair | null> {
  if (isFresh(cached)) return Promise.resolve(cached.pair);
  if (inFlight) return inFlight;
  inFlight = fetch("/api/regime")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return null;
      const pair: RegimePair = { india: data.india, us: data.us };
      cached = { pair, fetchedAt: Date.now() };
      return pair;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Fetches the market regime client-side instead of blocking every page's
 * server render on it (BRIEF.md §8's light needs to be everywhere, but a
 * real Yahoo Finance call shouldn't hold up every single page load - see
 * DECISIONS.md). Starts as "—" and fills in once the request resolves.
 */
export function useMarketRegimes(): RegimePair {
  const [regimes, setRegimes] = useState<RegimePair>(() => (isFresh(cached) ? cached.pair : EMPTY_PAIR));

  useEffect(() => {
    let cancelled = false;
    fetchRegimePair().then((pair) => {
      if (!cancelled && pair) setRegimes(pair);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return regimes;
}

export function __resetRegimeClientCacheForTests(): void {
  cached = null;
  inFlight = null;
}

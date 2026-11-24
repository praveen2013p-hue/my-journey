"use client";

import { useEffect, useState } from "react";
import type { MarketRegime } from "./regime";

export interface RegimePair {
  india: MarketRegime;
  us: MarketRegime;
}

const EMPTY_REGIME: MarketRegime = { market: "IN", stage: null, isWeak: false };

/**
 * Fetches the market regime client-side instead of blocking every page's
 * server render on it (BRIEF.md §8's light needs to be everywhere, but a
 * real Yahoo Finance call shouldn't hold up every single page load - see
 * DECISIONS.md). Starts as "—" and fills in once the request resolves.
 */
export function useMarketRegimes(): RegimePair {
  const [regimes, setRegimes] = useState<RegimePair>({
    india: EMPTY_REGIME,
    us: { ...EMPTY_REGIME, market: "US" },
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/regime")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setRegimes({ india: data.india, us: data.us });
      })
      .catch(() => {
        // keep showing "—" - never break the page over this
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return regimes;
}

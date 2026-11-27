"use client";

import { useEffect, useRef, useState } from "react";
import { isMarketOpen } from "./market-hours";
import type { Market } from "./db/schema-types";

export interface QuoteInfo {
  price: number;
  previousClose: number | null;
  asOf: string;
  stale: boolean;
}

export interface QuoteItem {
  market: Market;
  /** The provider symbol - omit (or pass null) when unmapped, so it's never fetched at all. */
  symbol: string | null;
}

const POLL_MS = 45_000;

function keyFor(market: Market, symbol: string): string {
  return `${market}:${symbol}`;
}

/**
 * BRIEF.md §10: poll every 30-60s only while the tab is visible and that
 * market is open; otherwise fetch once and let the page show "last close".
 */
export function useQuotes(items: QuoteItem[]): Map<string, QuoteInfo> {
  const [quotes, setQuotes] = useState<Map<string, QuoteInfo>>(new Map());
  const itemsKey = items.map((i) => `${i.market}:${i.symbol ?? ""}`).join(",");
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchOnce() {
      const byMarket = new Map<Market, string[]>();
      for (const item of itemsRef.current) {
        if (!item.symbol) continue;
        const list = byMarket.get(item.market) ?? [];
        list.push(item.symbol);
        byMarket.set(item.market, list);
      }
      if (byMarket.size === 0) return;

      const entries = await Promise.all(
        Array.from(byMarket.entries()).map(async ([market, symbols]) => {
          try {
            const res = await fetch(
              `/api/quotes?market=${market}&symbols=${encodeURIComponent(symbols.join(","))}`,
            );
            if (!res.ok) return [] as Array<[string, QuoteInfo]>;
            const data = await res.json();
            return Object.entries(data.quotes as Record<string, QuoteInfo>).map(
              ([symbol, q]) => [keyFor(market, symbol), q] as [string, QuoteInfo],
            );
          } catch {
            return [] as Array<[string, QuoteInfo]>;
          }
        }),
      );

      if (cancelled) return;
      setQuotes((prev) => {
        const next = new Map(prev);
        for (const list of entries) for (const [k, v] of list) next.set(k, v);
        return next;
      });
    }

    fetchOnce();
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const anyOpen = itemsRef.current.some((i) => isMarketOpen(i.market));
      if (anyOpen) fetchOnce();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [itemsKey]);

  return quotes;
}

export function quoteKey(market: Market, symbol: string): string {
  return keyFor(market, symbol);
}

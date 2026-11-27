/**
 * India ₹ and US $ amounts are never combined (BRIEF.md §2) and each uses
 * its own digit grouping (lakhs/crores vs thousands) - shared by Journal,
 * the Dashboard open-trades widget, and Performance.
 */

import type { Market } from "./db/schema-types";

export function currencySymbol(market: Market): string {
  return market === "IN" ? "₹" : "$";
}

export function formatMoney(market: Market, value: number): string {
  const locale = market === "IN" ? "en-IN" : "en-US";
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "−" : "";
  return `${sign}${currencySymbol(market)}${Math.abs(rounded).toLocaleString(locale)}`;
}

export function formatPct(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/** Shared sign-to-color helper - muted when there's no value at all, otherwise green for >=0, red for negative. */
export function colorForSigned(value: number | null): string {
  if (value === null) return "text-muted";
  return value >= 0 ? "text-pos" : "text-neg";
}

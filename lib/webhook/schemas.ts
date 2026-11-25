/**
 * TradingView webhook payload shapes, BRIEF.md §5. Every numeric field in
 * the stock-alert payload arrives as a **string** ("All numeric values
 * arrive as strings; parse them", §5) — the sector-board payload's numbers
 * arrive as real JSON numbers.
 */

import { z } from "zod";

const requiredNumeric = z
  .string()
  .min(1, "required numeric field is empty")
  .transform((v) => Number(v))
  .refine(Number.isFinite, "must be numeric");

const optionalNumeric = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v), "must be numeric");

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v));

export const StockAlertPayloadSchema = z.object({
  type: z.literal("stage2"),
  ticker: z.string().min(1),
  exchange: z.string().min(1),
  price: requiredNumeric,
  open: optionalNumeric,
  high: optionalNumeric,
  low: optionalNumeric,
  volume: optionalNumeric,
  interval: z.string().optional(),
  time: z.string().min(1),
  signal: z.string().min(1),
  alertName: z.string().optional(),
  grade: z.enum(["A", "B", "C"]),
  breakoutLevel: optionalNumeric,
  volRatio: optionalNumeric,
  rs: optionalNumeric, // Mansfield RS; the payload's field name is "rs"
  pctAboveMA: optionalNumeric,
  overheadPct: optionalNumeric,
  sector: optionalText,
  industry: optionalText,
  // Optional fundamentals, §5b - nullable, never required.
  marketCap: optionalNumeric,
  pe: optionalNumeric,
  epsTtm: optionalNumeric,
  epsGrowthYoY: optionalNumeric,
  epsGrowthQoQ: optionalNumeric,
  salesGrowthYoY: optionalNumeric,
  salesGrowthQoQ: optionalNumeric,
  roe: optionalNumeric,
  roce: optionalNumeric,
  debtToEquity: optionalNumeric,
  nextEarningsDate: optionalText,
});
export type StockAlertPayload = z.infer<typeof StockAlertPayloadSchema>;

export function hasAnyFundamentals(payload: StockAlertPayload): boolean {
  return [
    payload.marketCap,
    payload.pe,
    payload.epsTtm,
    payload.epsGrowthYoY,
    payload.epsGrowthQoQ,
    payload.salesGrowthYoY,
    payload.salesGrowthQoQ,
    payload.roe,
    payload.roce,
    payload.debtToEquity,
    payload.nextEarningsDate,
  ].some((v) => v !== null);
}

const SectorRowSchema = z.object({
  rank: z.number().optional(),
  sector: z.string().min(1),
  stage: z.number().int().min(1).max(4).nullable().optional(),
  rs: z.number().nullable().optional(),
  rsUp: z.boolean().nullable().optional(),
  vsMA: z.number().nullable().optional(),
  chg4: z.number().nullable().optional(),
  focus: z.boolean().optional(),
});

export const SectorBoardPayloadSchema = z.object({
  type: z.literal("sectorBoard"),
  week: z.string().min(1),
  sent: z.string().optional(),
  bench: z.string().optional(),
  market: z.enum(["IN", "US"]).optional(),
  // §17.6: accept a partial snapshot - rows is whatever arrived, never required to be complete.
  rows: z.array(SectorRowSchema),
});
export type SectorBoardPayload = z.infer<typeof SectorBoardPayloadSchema>;

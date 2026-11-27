import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { listUsTradingCapitalEntries, upsertUsTradingCapitalEntry } from "@/lib/db/us-trading-capital";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const entries = await listUsTradingCapitalEntries(session.userId);
  return NextResponse.json({ entries });
}

function toNullableNum(raw: unknown): number | null {
  return raw === null || raw === undefined || raw === "" ? null : Number(raw);
}

/** Creates or replaces this month's entry - at most one entry per user per month. */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const monthRaw = typeof body?.month === "string" ? body.month : "";
  const month = /^\d{4}-\d{2}$/.test(monthRaw) ? `${monthRaw}-01` : monthRaw;

  const amountAdded = body?.amount_added === null || body?.amount_added === undefined || body?.amount_added === "" ? 0 : Number(body.amount_added);
  const withdrawalRaw = body?.withdrawal;
  const withdrawal = withdrawalRaw === null || withdrawalRaw === undefined || withdrawalRaw === "" ? 0 : Number(withdrawalRaw);
  const inrAmount = toNullableNum(body?.inr_amount);
  const fxRate = toNullableNum(body?.fx_rate);
  const valueFxRate = toNullableNum(body?.value_fx_rate);
  const currentValue = Number(body?.current_value);
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  const negativeAmountNote =
    amountAdded < 0 && typeof body?.negative_amount_note === "string" && body.negative_amount_note.trim()
      ? body.negative_amount_note.trim()
      : null;

  if (
    !/^\d{4}-\d{2}-01$/.test(month) ||
    !Number.isFinite(amountAdded) ||
    !Number.isFinite(withdrawal) ||
    withdrawal < 0 ||
    (inrAmount !== null && !Number.isFinite(inrAmount)) ||
    (fxRate !== null && (!Number.isFinite(fxRate) || fxRate <= 0)) ||
    (valueFxRate !== null && (!Number.isFinite(valueFxRate) || valueFxRate <= 0)) ||
    !Number.isFinite(currentValue) ||
    currentValue < 0
  ) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const entry = await upsertUsTradingCapitalEntry(session.userId, {
    month,
    amount_added: amountAdded,
    withdrawal,
    inr_amount: inrAmount,
    fx_rate: fxRate,
    value_fx_rate: valueFxRate,
    current_value: currentValue,
    notes,
    negative_amount_note: negativeAmountNote,
  });
  return NextResponse.json({ entry }, { status: 201 });
}

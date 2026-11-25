import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { listMutualFundEntries, upsertMutualFundEntry } from "@/lib/db/mutual-funds";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const entries = await listMutualFundEntries(session.userId);
  return NextResponse.json({ entries });
}

/** Creates or replaces this month's entry - at most one entry per user per month. */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const monthRaw = typeof body?.month === "string" ? body.month : "";
  const month = /^\d{4}-\d{2}$/.test(monthRaw) ? `${monthRaw}-01` : monthRaw;

  const toNum = (raw: unknown): number => (raw === null || raw === undefined || raw === "" ? 0 : Number(raw));
  // A month's contribution is a mix of SIP, lumpsum and STP (DECISIONS.md) -
  // whenever any of these is given, amount_added is always their sum, never
  // trusted from the client directly, so the total can't drift from the parts.
  const hasBreakdown =
    body?.sip_amount !== undefined ||
    body?.lumpsum_amount !== undefined ||
    body?.stp_amount !== undefined ||
    body?.other_amount !== undefined;
  const sipAmount = hasBreakdown ? toNum(body?.sip_amount) : null;
  const lumpsumAmount = hasBreakdown ? toNum(body?.lumpsum_amount) : null;
  const stpAmount = hasBreakdown ? toNum(body?.stp_amount) : null;
  const otherAmount = hasBreakdown ? toNum(body?.other_amount) : null;
  const amountAdded = hasBreakdown
    ? (sipAmount ?? 0) + (lumpsumAmount ?? 0) + (stpAmount ?? 0) + (otherAmount ?? 0)
    : toNum(body?.amount_added);

  const withdrawalRaw = body?.withdrawal;
  const withdrawal = withdrawalRaw === null || withdrawalRaw === undefined || withdrawalRaw === "" ? 0 : Number(withdrawalRaw);
  const plannedAmountRaw = body?.planned_amount;
  const plannedAmount =
    plannedAmountRaw === null || plannedAmountRaw === undefined || plannedAmountRaw === "" ? null : Number(plannedAmountRaw);
  const currentValue = Number(body?.current_value);
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  const negativeAmountNote =
    amountAdded < 0 && typeof body?.negative_amount_note === "string" && body.negative_amount_note.trim()
      ? body.negative_amount_note.trim()
      : null;

  if (
    !/^\d{4}-\d{2}-01$/.test(month) ||
    !Number.isFinite(amountAdded) ||
    (hasBreakdown && ![sipAmount, lumpsumAmount, stpAmount, otherAmount].every(Number.isFinite)) ||
    !Number.isFinite(withdrawal) ||
    withdrawal < 0 ||
    (plannedAmount !== null && (!Number.isFinite(plannedAmount) || plannedAmount < 0)) ||
    !Number.isFinite(currentValue) ||
    currentValue < 0
  ) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const entry = await upsertMutualFundEntry(session.userId, {
    month,
    amount_added: amountAdded,
    sip_amount: sipAmount,
    lumpsum_amount: lumpsumAmount,
    stp_amount: stpAmount,
    other_amount: otherAmount,
    withdrawal,
    planned_amount: plannedAmount,
    current_value: currentValue,
    notes,
    negative_amount_note: negativeAmountNote,
  });
  return NextResponse.json({ entry }, { status: 201 });
}

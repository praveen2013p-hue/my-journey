import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { deleteNpsEntry, getNpsEntryById, updateNpsEntry } from "@/lib/db/nps";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getNpsEntryById(session.userId, id);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const update: {
    amount_added?: number;
    sip_amount?: number | null;
    lumpsum_amount?: number | null;
    stp_amount?: number | null;
    other_amount?: number | null;
    withdrawal?: number;
    planned_amount?: number | null;
    current_value?: number;
    notes?: string | null;
    negative_amount_note?: string | null;
  } = {};

  // A month's contribution is a mix of SIP, lumpsum and STP (DECISIONS.md) -
  // whenever the Edit form sends the breakdown, amount_added is always
  // recomputed as their sum, never trusted from the client directly, so the
  // total can't drift from the parts. Falls back to a direct amount_added
  // when no breakdown is sent (e.g. older API callers, or the table's
  // standalone negative-amount-note save, which never touches amount_added).
  const hasBreakdown =
    body?.sip_amount !== undefined ||
    body?.lumpsum_amount !== undefined ||
    body?.stp_amount !== undefined ||
    body?.other_amount !== undefined;

  if (hasBreakdown) {
    const toNum = (raw: unknown): number => (raw === null || raw === undefined || raw === "" ? 0 : Number(raw));
    const sipAmount = toNum(body.sip_amount);
    const lumpsumAmount = toNum(body.lumpsum_amount);
    const stpAmount = toNum(body.stp_amount);
    const otherAmount = toNum(body.other_amount);
    if (![sipAmount, lumpsumAmount, stpAmount, otherAmount].every(Number.isFinite)) {
      return NextResponse.json({ error: "invalid_amount_added" }, { status: 400 });
    }
    update.sip_amount = sipAmount;
    update.lumpsum_amount = lumpsumAmount;
    update.stp_amount = stpAmount;
    update.other_amount = otherAmount;
    update.amount_added = sipAmount + lumpsumAmount + stpAmount + otherAmount;
  } else if (body?.amount_added !== undefined) {
    const amountAdded = Number(body.amount_added);
    if (!Number.isFinite(amountAdded)) {
      return NextResponse.json({ error: "invalid_amount_added" }, { status: 400 });
    }
    update.amount_added = amountAdded;
  }
  if (body?.withdrawal !== undefined) {
    const withdrawal = Number(body.withdrawal);
    if (!Number.isFinite(withdrawal) || withdrawal < 0) {
      return NextResponse.json({ error: "invalid_withdrawal" }, { status: 400 });
    }
    update.withdrawal = withdrawal;
  }
  if (body?.planned_amount !== undefined) {
    const plannedAmount = body.planned_amount === null || body.planned_amount === "" ? null : Number(body.planned_amount);
    if (plannedAmount !== null && (!Number.isFinite(plannedAmount) || plannedAmount < 0)) {
      return NextResponse.json({ error: "invalid_planned_amount" }, { status: 400 });
    }
    update.planned_amount = plannedAmount;
  }
  if (body?.current_value !== undefined) {
    const currentValue = Number(body.current_value);
    if (!Number.isFinite(currentValue) || currentValue < 0) {
      return NextResponse.json({ error: "invalid_current_value" }, { status: 400 });
    }
    update.current_value = currentValue;
  }
  if (body?.notes !== undefined) {
    update.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }
  if (body?.negative_amount_note !== undefined) {
    update.negative_amount_note =
      typeof body.negative_amount_note === "string" && body.negative_amount_note.trim()
        ? body.negative_amount_note.trim()
        : null;
  }

  const entry = await updateNpsEntry(session.userId, id, update);
  return NextResponse.json({ entry });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  await deleteNpsEntry(session.userId, id);
  return NextResponse.json({ ok: true });
}

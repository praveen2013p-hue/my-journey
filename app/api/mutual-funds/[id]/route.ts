import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { deleteMutualFundEntry, getMutualFundEntryById, updateMutualFundEntry } from "@/lib/db/mutual-funds";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getMutualFundEntryById(session.userId, id);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const update: {
    amount_added?: number;
    withdrawal?: number;
    planned_amount?: number | null;
    current_value?: number;
    notes?: string | null;
    negative_amount_note?: string | null;
  } = {};

  if (body?.amount_added !== undefined) {
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

  const entry = await updateMutualFundEntry(session.userId, id, update);
  return NextResponse.json({ entry });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  await deleteMutualFundEntry(session.userId, id);
  return NextResponse.json({ ok: true });
}

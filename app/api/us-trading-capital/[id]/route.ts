import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import {
  deleteUsTradingCapitalEntry,
  getUsTradingCapitalEntryById,
  updateUsTradingCapitalEntry,
} from "@/lib/db/us-trading-capital";

export const dynamic = "force-dynamic";

function toNullableNum(raw: unknown): number | null {
  return raw === null || raw === undefined || raw === "" ? null : Number(raw);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getUsTradingCapitalEntryById(session.userId, id);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const update: {
    amount_added?: number;
    withdrawal?: number;
    inr_amount?: number | null;
    fx_rate?: number | null;
    value_fx_rate?: number | null;
    current_value?: number;
    notes?: string | null;
    negative_amount_note?: string | null;
  } = {};

  if (body?.amount_added !== undefined) {
    const amountAdded = Number(body.amount_added);
    if (!Number.isFinite(amountAdded)) return NextResponse.json({ error: "invalid_amount_added" }, { status: 400 });
    update.amount_added = amountAdded;
  }
  if (body?.withdrawal !== undefined) {
    const withdrawal = Number(body.withdrawal);
    if (!Number.isFinite(withdrawal) || withdrawal < 0) {
      return NextResponse.json({ error: "invalid_withdrawal" }, { status: 400 });
    }
    update.withdrawal = withdrawal;
  }
  if (body?.inr_amount !== undefined) {
    const inrAmount = toNullableNum(body.inr_amount);
    if (inrAmount !== null && !Number.isFinite(inrAmount)) {
      return NextResponse.json({ error: "invalid_inr_amount" }, { status: 400 });
    }
    update.inr_amount = inrAmount;
  }
  if (body?.fx_rate !== undefined) {
    const fxRate = toNullableNum(body.fx_rate);
    if (fxRate !== null && (!Number.isFinite(fxRate) || fxRate <= 0)) {
      return NextResponse.json({ error: "invalid_fx_rate" }, { status: 400 });
    }
    update.fx_rate = fxRate;
  }
  if (body?.value_fx_rate !== undefined) {
    const valueFxRate = toNullableNum(body.value_fx_rate);
    if (valueFxRate !== null && (!Number.isFinite(valueFxRate) || valueFxRate <= 0)) {
      return NextResponse.json({ error: "invalid_value_fx_rate" }, { status: 400 });
    }
    update.value_fx_rate = valueFxRate;
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

  const entry = await updateUsTradingCapitalEntry(session.userId, id, update);
  return NextResponse.json({ entry });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  await deleteUsTradingCapitalEntry(session.userId, id);
  return NextResponse.json({ ok: true });
}

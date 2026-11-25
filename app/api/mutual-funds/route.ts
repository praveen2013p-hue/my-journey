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
  const amountAddedRaw = body?.amount_added;
  const amountAdded = amountAddedRaw === null || amountAddedRaw === undefined || amountAddedRaw === "" ? 0 : Number(amountAddedRaw);
  const currentValue = Number(body?.current_value);
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  if (
    !/^\d{4}-\d{2}-01$/.test(month) ||
    !Number.isFinite(amountAdded) ||
    !Number.isFinite(currentValue) ||
    currentValue < 0
  ) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const entry = await upsertMutualFundEntry(session.userId, {
    month,
    amount_added: amountAdded,
    current_value: currentValue,
    notes,
  });
  return NextResponse.json({ entry }, { status: 201 });
}

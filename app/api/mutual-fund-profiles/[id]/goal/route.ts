import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { setMutualFundProfileGoal } from "@/lib/db/mutual-fund-profiles";

export const dynamic = "force-dynamic";

/** Sets or clears (with `goal_amount: null`) a profile's target corpus. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const raw = body?.goal_amount;

  let goalAmount: number | null;
  if (raw === null || raw === undefined || raw === "") {
    goalAmount = null;
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: "invalid_goal_amount" }, { status: 400 });
    }
    goalAmount = n;
  }

  const updated = await setMutualFundProfileGoal(session.userId, id, goalAmount);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ profile: updated });
}

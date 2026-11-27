import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { setUserNavTradingLabel } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ error: "invalid_label" }, { status: 400 });

  await setUserNavTradingLabel(session.userId, label);
  return NextResponse.json({ ok: true });
}

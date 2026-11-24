import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { saveWeeklyReflection } from "@/lib/db/weekly-reflections";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const weekEnding = typeof body?.week_ending === "string" ? body.week_ending : null;
  const text = typeof body?.text === "string" ? body.text : null;
  if (!weekEnding || text === null) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  await saveWeeklyReflection(session.userId, weekEnding, text.slice(0, 4000));
  return NextResponse.json({ ok: true });
}

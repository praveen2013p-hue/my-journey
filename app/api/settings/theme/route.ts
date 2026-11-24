import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { setUserTheme } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (body?.theme !== "dark" && body?.theme !== "light") {
    return NextResponse.json({ error: "invalid_theme" }, { status: 400 });
  }

  await setUserTheme(session.userId, body.theme);
  return NextResponse.json({ ok: true });
}

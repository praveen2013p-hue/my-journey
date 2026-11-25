import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { setUserBirthYear } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const raw = form.get("birth_year");
  const birthYear = raw === null || raw === "" ? null : Number(raw);

  const currentYear = new Date().getUTCFullYear();
  if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear)) {
    return NextResponse.redirect(new URL("/settings?error=invalid_birth_year", request.url), { status: 303 });
  }

  await setUserBirthYear(session.userId, birthYear);
  return NextResponse.redirect(new URL("/settings", request.url), { status: 303 });
}

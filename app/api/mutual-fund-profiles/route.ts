import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { createMutualFundProfile, listMutualFundProfiles } from "@/lib/db/mutual-fund-profiles";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const profiles = await listMutualFundProfiles(session.userId);
  return NextResponse.json({ profiles });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });

  const profile = await createMutualFundProfile(session.userId, name);
  return NextResponse.json({ profile }, { status: 201 });
}

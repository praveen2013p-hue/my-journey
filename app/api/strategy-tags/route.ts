import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { findOrCreateStrategyTag, listStrategyTags } from "@/lib/db/strategy-tags";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tags = await listStrategyTags(session.userId);
  return NextResponse.json({ tags });
}

/** "Pick or type to create" (BRIEF.md §7.4) - idempotent find-or-create by name. */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  const tag = await findOrCreateStrategyTag(session.userId, name);
  return NextResponse.json({ tag }, { status: 201 });
}

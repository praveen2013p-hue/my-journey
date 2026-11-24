import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { deleteStrategyTag, renameStrategyTag } from "@/lib/db/strategy-tags";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  await renameStrategyTag(session.userId, id, name);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  await deleteStrategyTag(session.userId, id);
  return NextResponse.json({ ok: true });
}

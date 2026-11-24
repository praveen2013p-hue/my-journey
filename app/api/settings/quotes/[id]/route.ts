import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { deleteQuote, setQuoteActive, updateQuoteText } from "@/lib/db/quotes";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isFinite(quoteId)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (typeof body?.active === "boolean") {
    await setQuoteActive(quoteId, body.active);
  }
  if (typeof body?.text === "string") {
    const text = body.text.trim();
    const author = typeof body?.author === "string" && body.author.trim() ? body.author.trim() : null;
    if (!text || text.length > 500) return NextResponse.json({ error: "invalid_text" }, { status: 400 });
    await updateQuoteText(quoteId, text, author);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isFinite(quoteId)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  await deleteQuote(quoteId);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { addQuote, listAllQuotes } from "@/lib/db/quotes";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const quotes = await listAllQuotes();
  return NextResponse.json({ quotes });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const author = typeof body?.author === "string" && body.author.trim() ? body.author.trim() : null;
  if (!text || text.length > 500) {
    return NextResponse.json({ error: "invalid_text" }, { status: 400 });
  }

  const quote = await addQuote(text, author, session.userId);
  return NextResponse.json({ quote }, { status: 201 });
}

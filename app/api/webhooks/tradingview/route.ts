import { after } from "next/server";
import { NextResponse } from "next/server";
import { processWebhookQuickPath } from "@/lib/webhook/process";

// Never cached/prerendered: every request must run for real (BRIEF.md §17.1).
export const dynamic = "force-dynamic";

function clientKeyFor(request: Request): string {
  // Best-effort client identity for the wrong-secret rate limiter only
  // (BRIEF.md §17.2); a correct-secret request never consults this.
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  // TradingView may send text/plain; always read the raw body and parse it
  // ourselves (BRIEF.md §5).
  const rawBody = await request.text();
  const querySecret = new URL(request.url).searchParams.get("secret") ?? undefined;
  const result = await processWebhookQuickPath(rawBody, clientKeyFor(request), querySecret);

  if (result.deferredWork) {
    after(result.deferredWork);
  }

  return NextResponse.json(result.body, { status: result.status });
}

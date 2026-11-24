import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { getBothMarketRegimes } from "@/lib/regime";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { india, us } = await getBothMarketRegimes();
  return NextResponse.json({ india, us });
}

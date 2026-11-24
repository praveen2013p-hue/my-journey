import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";
import { updateSiteName } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const siteName = String(form.get("site_name") ?? "").trim();
  if (!siteName) {
    return NextResponse.redirect(new URL("/settings?error=empty_name", request.url), { status: 303 });
  }

  await updateSiteName(siteName.slice(0, 60));
  return NextResponse.redirect(new URL("/settings", request.url), { status: 303 });
}

import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/auth/allowed-emails";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Google OAuth redirects here with `?code=...` after the user approves
 * sign-in on Google's side. The allow-list is enforced here too, not
 * just in the UI (BRIEF.md §2: "Anyone else is signed out with 'Access
 * restricted'") - completing Google OAuth proves who you are, not that
 * you're one of the two people this app is for.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  const email = data.user?.email;
  if (error || !email || !isEmailAllowed(email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}

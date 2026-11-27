import { redirect } from "next/navigation";
import { LoginQuoteRotator } from "@/components/LoginQuoteRotator";
import { getAllowedEmails } from "@/lib/auth/allowed-emails";
import { getOptionalSession } from "@/lib/auth/dal";
import { getAppSettings } from "@/lib/db/settings";
import { listActiveQuotes, seedQuotesIfEmpty } from "@/lib/db/quotes";
import { QUOTE_SEED } from "@/lib/quotes-seed";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getOptionalSession();
  if (session) redirect("/dashboard");

  const { error } = await searchParams;

  await seedQuotesIfEmpty(QUOTE_SEED);
  const [appSettings, quoteRows] = await Promise.all([getAppSettings(), listActiveQuotes()]);
  const quotes = quoteRows.map((q) => ({ text: q.text, author: q.author }));
  // This page is always dynamically rendered per-request (never statically
  // cached/reused), so a fresh random starting quote each load is exactly
  // the intent, not a purity hazard - must stay a value computed once on
  // the server and passed down, never recomputed client-side, or SSR and
  // hydration would pick different quotes and mismatch.
  // eslint-disable-next-line react-hooks/purity
  const initialIndex = quotes.length > 0 ? Math.floor(Math.random() * quotes.length) : 0;

  const allowedEmails = getAllowedEmails();

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 800px at 15% 10%, rgba(201,162,74,0.06), transparent 60%)",
        }}
      />

      <div className="absolute left-6 top-7 font-serif text-xl font-semibold text-gold sm:left-[120px] sm:top-14 sm:text-[28px]">
        {appSettings.site_name}
      </div>

      <div
        aria-hidden="true"
        className="absolute left-6 top-24 hidden select-none font-serif text-[220px] leading-none text-[#1F2126] sm:left-[96px] sm:top-[60px] sm:block sm:text-[300px]"
      >
        &ldquo;
      </div>

      {quotes.length > 0 && (
        <div className="absolute left-6 right-6 top-40 sm:left-[120px] sm:right-auto sm:top-[210px]">
          <LoginQuoteRotator quotes={quotes} initialIndex={initialIndex} />
        </div>
      )}

      <section
        aria-label="Sign in"
        className="absolute inset-x-4 bottom-4 flex flex-col gap-4 rounded-2xl border border-border bg-panel p-7 sm:inset-x-auto sm:bottom-12 sm:right-12 sm:w-[380px]"
      >
        <div>
          <div className="font-serif text-[34px] font-semibold leading-tight text-gold-light">
            {appSettings.site_name}
          </div>
          <div className="mt-1.5 text-sm text-muted">Patience. Process. Compounding.</div>
        </div>

        {error === "not_allowed" && (
          <p className="rounded-lg border border-neg-border bg-neg-wash px-3 py-2 text-sm text-neg">
            That Google account isn&apos;t on the approved list for this workspace.
          </p>
        )}

        {allowedEmails.length === 0 ? (
          <p className="rounded-lg border border-warn-border bg-warn-wash px-3 py-2 text-sm text-warn">
            No <code>ALLOWED_EMAILS</code> configured yet — set it in your environment to sign in.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {allowedEmails.map((email) => (
              <form key={email} action="/api/auth/mock-login" method="POST">
                <input type="hidden" name="email" value={email} />
                <button
                  type="submit"
                  className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-gold bg-gold font-semibold text-bg hover:bg-gold-hover"
                >
                  Continue as {email}
                </button>
              </form>
            ))}
          </div>
        )}

        <p className="text-xs text-muted">
          Private workspace. Only two approved Google accounts can enter.
          {allowedEmails.length > 0 && " (Phase 1: pick your account above — real Google sign-in replaces this once Supabase is connected.)"}
        </p>
      </section>
    </div>
  );
}

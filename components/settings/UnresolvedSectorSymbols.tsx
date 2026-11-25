/**
 * Split out of app/(app)/settings/page.tsx on purpose (DECISIONS.md): this
 * is the one part of Settings that can be genuinely slow - up to ~24 Kite
 * index searches, which on a cold serverless instance means downloading
 * and parsing Kite's multi-MB NSE instrument dump (the in-memory cache in
 * lib/zerodha/instruments.ts doesn't reliably survive between invocations
 * the way its "24h TTL" implies). Rendered as its own async Server
 * Component wrapped in <Suspense> by the page, so a slow Kite response
 * only delays THIS section streaming in, never the rest of Settings.
 */

import { isOwnerEmail } from "@/lib/auth/allowed-emails";
import { getZerodhaSession } from "@/lib/db/provider-session";
import { listUnresolvedSectors } from "@/lib/db/sector-map";
import { sectorSearchKeyword, searchIndexInstruments, type IndexInstrument } from "@/lib/zerodha/instruments";

export async function UnresolvedSectorSymbols({
  email,
  q,
  resolveStatus,
}: {
  email: string;
  q: string | undefined;
  resolveStatus: string | undefined;
}) {
  const isOwner = isOwnerEmail(email);
  const [unresolvedSectors, zerodhaSession] = await Promise.all([listUnresolvedSectors(), getZerodhaSession()]);
  const unresolvedIndiaSectors = unresolvedSectors.filter((s) => s.market === "IN");

  const instrumentMatches =
    isOwner && zerodhaSession && q ? await searchIndexInstruments(zerodhaSession.accessToken, q) : [];

  // Auto-suggest candidates per unresolved sector, so confirming one is
  // usually a single click instead of a manual search - the search box
  // below stays as a fallback for whichever ones don't auto-match.
  const suggestionsBySector = new Map<string, IndexInstrument[]>();
  if (isOwner && zerodhaSession) {
    const entries = await Promise.all(
      unresolvedIndiaSectors.map(async (s) => {
        const matches = await searchIndexInstruments(zerodhaSession.accessToken, sectorSearchKeyword(s.display_name));
        return [s.display_name, matches.slice(0, 3)] as const;
      }),
    );
    for (const [name, matches] of entries) suggestionsBySector.set(name, matches);
  }

  return (
    <>
      {unresolvedSectors.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Unresolved sector indices ({unresolvedSectors.length})
          </h3>
          <p className="mb-2 text-xs text-muted">
            No confirmed TradingView/provider symbol yet, so the Sectors page shows &ldquo;—&rdquo; for these
            indices&apos; own 1W price change (their Stage/RS from your webhook still works fine).
            {isOwner && zerodhaSession && (
              <> Where a likely Kite match was found, click it to confirm - no typing needed.</>
            )}
          </p>
          <div className="flex flex-col gap-1.5">
            {unresolvedSectors.map((s) => {
              const candidates = s.market === "IN" ? (suggestionsBySector.get(s.display_name) ?? []) : [];
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-warn-border bg-warn-wash px-2.5 py-0.5 text-xs font-semibold text-warn">
                    {s.market} · {s.display_name}
                  </span>
                  {candidates.length === 0 ? (
                    isOwner && zerodhaSession && s.market === "IN" ? (
                      <span className="text-xs text-muted">no auto-match - try the search below</span>
                    ) : null
                  ) : (
                    candidates.map((c) => (
                      <form key={c.tradingsymbol} action="/api/admin/sector-map-resolve" method="POST">
                        <input type="hidden" name="market" value="IN" />
                        <input type="hidden" name="sector" value={s.display_name} />
                        <input type="hidden" name="symbol" value={c.tradingsymbol} />
                        <button
                          type="submit"
                          title={c.name}
                          className="rounded-full border border-border-strong bg-chip-neutral px-2.5 py-0.5 text-xs hover:border-gold-border hover:bg-gold-wash hover:text-gold-light"
                        >
                          {c.tradingsymbol}
                        </button>
                      </form>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isOwner && zerodhaSession && unresolvedIndiaSectors.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Find a sector&apos;s real Kite symbol
          </h3>
          <p className="mb-2 text-xs text-muted">
            Sector symbols above (like &ldquo;BANKNIFTY&rdquo;) are TradingView&apos;s own names, which don&apos;t
            always match what Kite&apos;s instrument dump calls the same index. Search Kite&apos;s real index
            list below, then confirm the right one for a sector.
          </p>
          <form method="GET" className="mb-3 flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="e.g. bank, IT, defence"
              className="min-h-[40px] rounded-lg border border-border-strong bg-field px-3 text-text"
            />
            <button
              type="submit"
              className="min-h-[40px] rounded-lg border border-border-strong bg-panel-alt px-3.5 text-sm font-medium hover:bg-panel"
            >
              Search
            </button>
          </form>

          {q && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {instrumentMatches.length === 0 ? (
                <span className="text-xs text-muted">No Kite index matched &ldquo;{q}&rdquo;.</span>
              ) : (
                instrumentMatches.map((m) => (
                  <span
                    key={m.tradingsymbol}
                    className="rounded-full border border-border-strong bg-chip-neutral px-2.5 py-0.5 text-xs"
                  >
                    <span className="font-semibold">{m.tradingsymbol}</span> — {m.name}
                  </span>
                ))
              )}
            </div>
          )}

          {resolveStatus === "ok" && (
            <div className="mb-2 rounded-[10px] border border-pos-border bg-pos-wash px-3 py-2 text-xs text-pos">
              Saved. That sector will use this symbol next time you run the backfill or view Sectors.
            </div>
          )}
          {resolveStatus === "error" && (
            <div className="mb-2 rounded-[10px] border border-neg-border bg-neg-wash px-3 py-2 text-xs text-neg">
              Couldn&apos;t save - try again.
            </div>
          )}

          <form action="/api/admin/sector-map-resolve" method="POST" className="flex flex-wrap items-center gap-2.5">
            <input type="hidden" name="market" value="IN" />
            <select
              name="sector"
              required
              className="min-h-[40px] rounded-lg border border-border-strong bg-field px-3 text-text"
            >
              {unresolvedIndiaSectors.map((s) => (
                <option key={s.id} value={s.display_name}>
                  {s.display_name}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="symbol"
              required
              placeholder="confirmed tradingsymbol, e.g. NIFTY BANK"
              className="min-h-[40px] w-56 rounded-lg border border-border-strong bg-field px-3 text-text"
            />
            <button
              type="submit"
              className="min-h-[40px] rounded-lg border border-gold bg-gold px-3.5 text-sm font-semibold text-bg hover:bg-gold-hover"
            >
              Save symbol
            </button>
          </form>
        </div>
      )}
    </>
  );
}
